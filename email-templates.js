/**
 * Branded HTML email templates for verification emails.
 * Used by server.js for creator and brand signup/resend verification.
 */

export function buildCreatorVerifyEmail(name, confirmUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your Creatorship account</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#12131f;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        
        <!-- Header gradient bar -->
        <tr><td style="background:linear-gradient(135deg,#FE2C55 0%,#ff6b35 50%,#25F4EE 100%);padding:3px 0;"></td></tr>
        
        <!-- Logo area -->
        <tr><td style="padding:36px 40px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">
            <span style="color:#FE2C55;">Creator</span><span style="color:#ffffff;">ship</span>
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">TikTok Creators × Meta Ads</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">🎬</div>
          <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 12px;line-height:1.2;">You're almost in, ${name || 'Creator'}.</h1>
          <p style="color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;margin:0 0 28px;">
            Confirm your email to unlock your creator dashboard — where your TikTok content turns into real ad revenue.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#FE2C55,#ff6b35);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:0.3px;">
            Confirm Email →
          </a>
        </td></tr>

        <!-- Value props -->
        <tr><td style="padding:0 40px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:rgba(254,44,85,0.08);border:1px solid rgba(254,44,85,0.15);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">💰</div>
                <div style="color:#FE2C55;font-size:12px;font-weight:700;margin-top:6px;">Get Paid</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">Commission on every sale your content drives</div>
              </td>
              <td style="width:8px;"></td>
              <td style="background:rgba(37,244,238,0.08);border:1px solid rgba(37,244,238,0.15);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">🎯</div>
                <div style="color:#25F4EE;font-size:12px;font-weight:700;margin-top:6px;">Brand Deals</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">Get matched with brands that fit your audience</div>
              </td>
              <td style="width:8px;"></td>
              <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">📊</div>
                <div style="color:#ffffff;font-size:12px;font-weight:700;margin-top:6px;">Track It All</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">Real-time earnings dashboard in one place</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0 0 8px;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
          <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0;">© 2026 Creatorship, LLC · Greenville, SC · <a href="https://www.creatorship.app" style="color:rgba(37,244,238,0.6);text-decoration:none;">creatorship.app</a></p>
        </td></tr>

        <!-- Bottom gradient bar -->
        <tr><td style="background:linear-gradient(135deg,#FE2C55 0%,#ff6b35 50%,#25F4EE 100%);padding:3px 0;"></td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildBrandVerifyEmail(brandName, confirmUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your Creatorship account</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#12131f;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        
        <!-- Header gradient bar -->
        <tr><td style="background:linear-gradient(135deg,#0668E1 0%,#0099ff 50%,#25F4EE 100%);padding:3px 0;"></td></tr>
        
        <!-- Logo area -->
        <tr><td style="padding:36px 40px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">
            <span style="color:#0099ff;">Creator</span><span style="color:#ffffff;">ship</span>
          </div>
          <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">TikTok Creators × Meta Ads</div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">🚀</div>
          <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 12px;line-height:1.2;">Welcome aboard, ${brandName || 'Brand'}.</h1>
          <p style="color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;margin:0 0 28px;">
            Confirm your email to access your brand dashboard — and start turning TikTok creators into your highest-performing ad channel.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#0668E1,#0099ff);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;letter-spacing:0.3px;">
            Confirm Email →
          </a>
        </td></tr>

        <!-- Value props -->
        <tr><td style="padding:0 40px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:rgba(6,104,225,0.1);border:1px solid rgba(6,104,225,0.2);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">🎥</div>
                <div style="color:#0099ff;font-size:12px;font-weight:700;margin-top:6px;">UGC at Scale</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">200+ creator videos per month, done-for-you</div>
              </td>
              <td style="width:8px;"></td>
              <td style="background:rgba(37,244,238,0.08);border:1px solid rgba(37,244,238,0.15);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">📈</div>
                <div style="color:#25F4EE;font-size:12px;font-weight:700;margin-top:6px;">Meta Ready</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">Content built for TikTok Shop and Meta performance ads</div>
              </td>
              <td style="width:8px;"></td>
              <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;width:30%;text-align:center;vertical-align:top;">
                <div style="font-size:24px;">💡</div>
                <div style="color:#ffffff;font-size:12px;font-weight:700;margin-top:6px;">Pay on Results</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;">Commission-based — you only pay when it converts</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0 0 8px;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
          <p style="color:rgba(255,255,255,0.2);font-size:11px;margin:0;">© 2026 Creatorship, LLC · Greenville, SC · <a href="https://www.creatorship.app" style="color:rgba(37,244,238,0.6);text-decoration:none;">creatorship.app</a></p>
        </td></tr>

        <!-- Bottom gradient bar -->
        <tr><td style="background:linear-gradient(135deg,#0668E1 0%,#0099ff 50%,#25F4EE 100%);padding:3px 0;"></td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
