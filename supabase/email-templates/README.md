# Supabase auth email templates

HTML bodies for **Authentication → Email Templates** in the Supabase dashboard. Paste each file’s contents into the matching template.

## Design

- Matches Marble Stay UI: **slate-900** (`#0F172A`) primary, **slate** neutrals, system font stack.
- **Table-based layout** and **inline CSS** for common email clients.
- **Gradient header**, white card (max ~560px), rounded corners, soft shadow.
- **Primary CTA** (bulletproof button) plus **OTP** in a monospace panel where applicable.

## Suggested subjects

| Template | Subject |
| --- | --- |
| Confirm sign up | Confirm your Marble Stay account |
| Invite user | You’re invited to Marble Stay |
| Magic link | Your Marble Stay sign-in link |
| Change email address | Confirm your new email for Marble Stay |
| Reset password | Reset your Marble Stay password |
| Reauthentication | Your Marble Stay verification code |

## Variables

See [Supabase: Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates). These snippets use `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}` as needed per template.
