CREATE TYPE public.app_role AS ENUM ('owner', 'branch_manager');

CREATE TABLE public.branches (
  id int PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT UPDATE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  branch_id int REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, branch_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND (role = 'owner' OR (role = 'branch_manager' AND branch_id = _branch))
  )
$$;

CREATE POLICY "own roles or owner" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "branches public read" ON public.branches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "owner updates branches" ON public.branches FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  cuisine text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu public read" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "owner insert menu" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner update menu" ON public.menu_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner')) WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner delete menu" ON public.menu_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  branch_id int NOT NULL REFERENCES public.branches(id),
  customer_name text NOT NULL,
  phone text NOT NULL,
  table_number text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('dine_in','delivery')),
  items jsonb NOT NULL,
  total numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','ready','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branch staff read orders" ON public.orders FOR SELECT TO authenticated USING (public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "branch staff update orders" ON public.orders FOR UPDATE TO authenticated USING (public.can_access_branch(auth.uid(), branch_id)) WITH CHECK (public.can_access_branch(auth.uid(), branch_id));
CREATE POLICY "owner delete orders" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Customers place orders only through this function; prices are taken from the menu, never from the browser.
CREATE OR REPLACE FUNCTION public.place_order(_branch_id int, _name text, _phone text, _table text, _type text, _items jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _line jsonb; _item record; _qty int; _total numeric := 0; _out jsonb := '[]'::jsonb; _num bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = _branch_id) THEN RAISE EXCEPTION 'Invalid branch'; END IF;
  _name := btrim(coalesce(_name,'')); _phone := btrim(coalesce(_phone,'')); _table := btrim(coalesce(_table,''));
  IF length(_name) < 2 OR length(_name) > 80 THEN RAISE EXCEPTION 'Please enter a valid name'; END IF;
  IF _phone !~ '^\+?[0-9 ]{10,15}$' THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;
  IF length(_table) < 1 OR length(_table) > 20 THEN RAISE EXCEPTION 'Please enter a table number'; END IF;
  IF _type NOT IN ('dine_in','delivery') THEN RAISE EXCEPTION 'Choose dine in or delivery'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 100 THEN RAISE EXCEPTION 'Your cart is empty'; END IF;
  FOR _line IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_line->>'qty')::int;
    IF _qty IS NULL OR _qty < 1 OR _qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT id, name, price INTO _item FROM menu_items WHERE id = (_line->>'id')::uuid AND is_available;
    IF NOT FOUND THEN RAISE EXCEPTION 'An item in your cart is no longer available'; END IF;
    _total := _total + _item.price * _qty;
    _out := _out || jsonb_build_object('id', _item.id, 'name', _item.name, 'price', _item.price, 'qty', _qty);
  END LOOP;
  INSERT INTO orders (branch_id, customer_name, phone, table_number, order_type, items, total)
  VALUES (_branch_id, _name, _phone, _table, _type, _out, _total) RETURNING order_number INTO _num;
  RETURN _num;
END $$;
GRANT EXECUTE ON FUNCTION public.place_order(int, text, text, text, text, jsonb) TO anon, authenticated;

-- First account ever created becomes the owner.
CREATE OR REPLACE FUNCTION public.handle_new_user_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_owner AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_owner();

CREATE OR REPLACE FUNCTION public.assign_branch_manager(_email text, _branch int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(btrim(_email));
  IF _uid IS NULL THEN RAISE EXCEPTION 'No account with that email. Ask them to create an account first.'; END IF;
  INSERT INTO public.user_roles (user_id, role, branch_id) VALUES (_uid, 'branch_manager', _branch) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.remove_branch_manager(_role_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
  DELETE FROM public.user_roles WHERE id = _role_id AND role = 'branch_manager';
END $$;

CREATE OR REPLACE FUNCTION public.list_branch_managers()
RETURNS TABLE (role_id uuid, email text, branch_id int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
  RETURN QUERY SELECT r.id, u.email::text, r.branch_id FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id WHERE r.role = 'branch_manager' ORDER BY r.branch_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_branch_manager(text,int), public.remove_branch_manager(uuid), public.list_branch_managers() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assign_branch_manager(text,int), public.remove_branch_manager(uuid), public.list_branch_managers() TO authenticated;

INSERT INTO public.branches (id, name, address, phone) VALUES
(1, 'Branch 1 — Chennai', 'Anna Salai, Chennai, Tamil Nadu', '+91 98400 00001'),
(2, 'Branch 2 — Madurai', 'Bypass Road, Madurai, Tamil Nadu', '+91 98400 00002'),
(3, 'Branch 3 — Coimbatore', 'Avinashi Road, Coimbatore, Tamil Nadu', '+91 98400 00003');

INSERT INTO public.menu_items (name, category, cuisine, price, sort_order) VALUES
('Chicken 65','Chinese Starters','Chinese',180,1),('Chilli Chicken Dry','Chinese Starters','Chinese',200,2),('Dragon Chicken','Chinese Starters','Chinese',230,3),('Chicken Lollipop','Chinese Starters','Chinese',220,4),('Pepper Chicken','Chinese Starters','Chinese',210,5),('Garlic Chicken','Chinese Starters','Chinese',210,6),('Crispy Fried Chicken','Chinese Starters','Chinese',200,7),('Honey Chilli Chicken','Chinese Starters','Chinese',240,8),('Chilli Prawns','Chinese Starters','Chinese',290,9),('Dragon Prawns','Chinese Starters','Chinese',310,10),('Golden Fried Prawns','Chinese Starters','Chinese',300,11),('Chilli Fish','Chinese Starters','Chinese',260,12),('Salt & Pepper Squid','Chinese Starters','Chinese',290,13),('Chicken Spring Rolls','Chinese Starters','Chinese',170,14),('Chicken Momos (8)','Chinese Starters','Chinese',160,15),
('Chicken Manchurian Gravy','Chinese Mains','Chinese',220,16),('Chilli Chicken Gravy','Chinese Mains','Chinese',220,17),('Kung Pao Chicken','Chinese Mains','Chinese',250,18),('Schezwan Chicken','Chinese Mains','Chinese',240,19),('Chicken in Hot Garlic Sauce','Chinese Mains','Chinese',240,20),('Ginger Chicken','Chinese Mains','Chinese',230,21),('Prawns in Black Bean Sauce','Chinese Mains','Chinese',320,22),('Fish in Lemon Sauce','Chinese Mains','Chinese',280,23),('Sweet & Sour Chicken','Chinese Mains','Chinese',230,24),('Mutton Chilli Fry','Chinese Mains','Chinese',320,25),
('Chicken Fried Rice','Noodles & Rice','Chinese',170,26),('Egg Fried Rice','Noodles & Rice','Chinese',140,27),('Schezwan Chicken Fried Rice','Noodles & Rice','Chinese',190,28),('Mixed Meat Fried Rice','Noodles & Rice','Chinese',230,29),('Prawn Fried Rice','Noodles & Rice','Chinese',220,30),('Chicken Hakka Noodles','Noodles & Rice','Chinese',170,31),('Egg Noodles','Noodles & Rice','Chinese',140,32),('Schezwan Chicken Noodles','Noodles & Rice','Chinese',190,33),('Mixed Meat Noodles','Noodles & Rice','Chinese',230,34),('Chicken Triple Schezwan Rice','Noodles & Rice','Chinese',250,35),('American Chopsuey (Chicken)','Noodles & Rice','Chinese',240,36),('Chicken Burnt Garlic Rice','Noodles & Rice','Chinese',200,37),
('Chicken Sweet Corn Soup','Soups','Chinese',120,38),('Chicken Hot & Sour Soup','Soups','Chinese',130,39),('Chicken Manchow Soup','Soups','Chinese',130,40),('Chicken Clear Soup','Soups','Chinese',110,41),('Seafood Soup','Soups','Chinese',170,42),('Mutton Paya Soup','Soups','Arabian',150,43),
('Chicken Shawarma Roll','Shawarma','Arabian',120,44),('Chicken Shawarma Plate','Shawarma','Arabian',200,45),('Mexican Shawarma','Shawarma','Arabian',140,46),('Cheese Shawarma','Shawarma','Arabian',150,47),('Spicy Shawarma','Shawarma','Arabian',130,48),('Shawarma Rumali','Shawarma','Arabian',140,49),('Beef Shawarma Roll','Shawarma','Arabian',150,50),('Shawarma Burger','Shawarma','Arabian',160,51),
('Al Faham Chicken (Quarter)','Grills','Arabian',150,52),('Al Faham Chicken (Half)','Grills','Arabian',280,53),('Al Faham Chicken (Full)','Grills','Arabian',520,54),('Peri Peri Grill (Half)','Grills','Arabian',300,55),('Tandoori Chicken (Half)','Grills','Arabian',280,56),('Chicken Shish Tawook','Grills','Arabian',260,57),('Mutton Seekh Kebab','Grills','Arabian',320,58),('Chicken Kebab Platter','Grills','Arabian',380,59),('Grilled Fish Arabic','Grills','Arabian',360,60),('Lamb Chops','Grills','Arabian',520,61),('Mixed Grill Platter','Grills','Arabian',750,62),('Kunafa Chicken Grill','Grills','Arabian',300,63),
('Chicken Mandi (Single)','Mandi & Kabsa','Arabian',280,64),('Chicken Mandi (Family)','Mandi & Kabsa','Arabian',950,65),('Mutton Mandi (Single)','Mandi & Kabsa','Arabian',420,66),('Mutton Mandi (Family)','Mandi & Kabsa','Arabian',1450,67),('Al Faham Mandi','Mandi & Kabsa','Arabian',320,68),('Chicken Kabsa','Mandi & Kabsa','Arabian',300,69),('Mutton Kabsa','Mandi & Kabsa','Arabian',440,70),('Fish Mandi','Mandi & Kabsa','Arabian',380,71),('Madhbi Chicken','Mandi & Kabsa','Arabian',320,72),('Zurbian Mutton','Mandi & Kabsa','Arabian',460,73),
('Hummus with Pita','Arabian Sides','Arabian',120,74),('Mutabal','Arabian Sides','Arabian',120,75),('Garlic Toum','Arabian Sides','Arabian',40,76),('Kuboos (2)','Arabian Sides','Arabian',30,77),('Arabic Salad','Arabian Sides','Arabian',90,78),('Chicken Harees','Arabian Sides','Arabian',220,79),
('Chicken Dum Biryani','Biryani','Tamil Special',220,80),('Mutton Dum Biryani','Biryani','Tamil Special',320,81),('Ambur Chicken Biryani','Biryani','Tamil Special',230,82),('Dindigul Mutton Biryani','Biryani','Tamil Special',340,83),('Prawn Biryani','Biryani','Tamil Special',300,84),('Fish Biryani','Biryani','Tamil Special',290,85),('Egg Biryani','Biryani','Tamil Special',160,86),('Chicken 65 Biryani','Biryani','Tamil Special',250,87),('Bucket Biryani (Chicken, 4 pax)','Biryani','Tamil Special',850,88),
('Chettinad Chicken Curry','Chettinad Specials','Tamil Special',240,89),('Chettinad Mutton Curry','Chettinad Specials','Tamil Special',320,90),('Pepper Mutton Fry','Chettinad Specials','Tamil Special',340,91),('Nattu Kozhi Kuzhambu','Chettinad Specials','Tamil Special',300,92),('Nethili Fish Fry','Chettinad Specials','Tamil Special',220,93),('Vanjaram Fish Fry','Chettinad Specials','Tamil Special',380,94),('Prawn Thokku','Chettinad Specials','Tamil Special',320,95),('Mutton Kola Urundai','Chettinad Specials','Tamil Special',260,96),('Kothu Parotta (Chicken)','Chettinad Specials','Tamil Special',180,97),('Egg Kalakki','Chettinad Specials','Tamil Special',70,98),('Parotta (2)','Chettinad Specials','Tamil Special',50,99),('Lime Mint Cooler','Beverages','Arabian',80,100),('Arabian Sulaimani Tea','Beverages','Arabian',40,101);