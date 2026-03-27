// Team auth management — admin user CRUD via Supabase service role key
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { promises as dns } from 'dns';

// Validate email: format check + MX record check (domain can receive email)
async function validateEmail(email) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }
  const domain = trimmed.split('@')[1];
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, error: `Email domain "${domain}" cannot receive email` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Email domain "${domain}" does not exist` };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getSupabaseAdmin();
    const { action } = req.body;

    switch (action) {
      /* ── Create a new team member ── */
      case 'create': {
        const { email, password, displayName } = req.body;
        if (!email || !password || !displayName) {
          return res.status(400).json({ error: 'email, password, and displayName are required' });
        }

        // Validate email exists
        const emailCheck = await validateEmail(email);
        if (!emailCheck.valid) {
          return res.status(400).json({ error: emailCheck.error });
        }

        const { data, error } = await db.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName.trim(), role: 'member' },
        });

        if (error) return res.status(400).json({ error: error.message });

        return res.json({
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.display_name,
          },
        });
      }

      /* ── List all auth users ── */
      case 'list': {
        const { data, error } = await db.auth.admin.listUsers();
        if (error) return res.status(500).json({ error: error.message });

        const users = (data?.users || []).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.user_metadata?.display_name || null,
          role: u.user_metadata?.role || null,
          createdAt: u.created_at,
          lastSignIn: u.last_sign_in_at || null,
        }));

        return res.json({ users });
      }

      /* ── Reset password (owner resetting for a member) ── */
      case 'resetPassword': {
        const { userId, newPassword } = req.body;
        if (!userId || !newPassword) {
          return res.status(400).json({ error: 'userId and newPassword are required' });
        }

        const { error } = await db.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) return res.status(400).json({ error: error.message });
        return res.json({ success: true });
      }

      /* ── Change password (team member changing their own) ── */
      case 'changePassword': {
        const { userId: cpUserId, newPassword: cpNewPassword } = req.body;
        if (!cpUserId || !cpNewPassword) {
          return res.status(400).json({ error: 'userId and newPassword are required' });
        }

        const { error } = await db.auth.admin.updateUserById(cpUserId, {
          password: cpNewPassword,
        });

        if (error) return res.status(400).json({ error: error.message });
        return res.json({ success: true });
      }

      /* ── Delete a user ── */
      case 'delete': {
        const { userId: delUserId } = req.body;
        if (!delUserId) {
          return res.status(400).json({ error: 'userId is required' });
        }

        const { error } = await db.auth.admin.deleteUser(delUserId);
        if (error) return res.status(400).json({ error: error.message });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[team-auth] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
