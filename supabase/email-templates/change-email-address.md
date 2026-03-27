<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;margin:0;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px 24px;">
            <p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Marble Stay</p>
            <p style="margin:6px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#94a3b8;line-height:1.4;">Romblon hotels &amp; guest experiences</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;line-height:1.25;">Confirm your new email</h1>
            <p style="margin:16px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#475569;">We received a request to update the email on your account. Review the details below, then confirm to apply the change.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Current email</p>
                  <p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#0f172a;">{{ .Email }}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 20px 16px 20px;border-top:1px solid #e2e8f0;">
                  <p style="margin:16px 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">New email</p>
                  <p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#0f172a;">{{ .NewEmail }}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="border-radius:12px;background-color:#0f172a;">
                  <a href="{{ .ConfirmationURL }}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">Confirm email change</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0 0 12px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Verification code</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
              <tr>
                <td style="padding:18px 20px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:0.2em;color:#0f172a;text-align:center;">{{ .Token }}</td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#94a3b8;">Until you confirm, we&rsquo;ll keep using your current email for sign-in and notifications. If you didn&rsquo;t request this, secure your account and contact support.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;"><a href="{{ .SiteURL }}" style="color:#0f172a;font-weight:600;text-decoration:none;">Marble Stay</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
