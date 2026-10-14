<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Orders are created only via the `place_order` database function (prices read from menu_items) — customers can never set totals or write tables directly.
- Owner/staff access lives in `user_roles` (owner, branch_manager + branch_id); the first account created becomes owner via an auth trigger.
- Owner dashboard listens to realtime inserts on `orders` for live alerts.
