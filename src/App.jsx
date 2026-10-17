import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT } from './lib/legalText';
import { SELLER_TERMS_TEXT, COMMISSION_PCT, PAYMENT_TERMS_DAYS } from './lib/sellerTerms';
import { COUNTRIES, REFUND_POLICIES, REFUND_OPTIONS, STATUTORY_NOTE, scheduleFor, needsDigitalWaiver, payoutRoute, MIN_PAYOUT } from './lib/legalSchedules';
import {
  Calendar, Users, ShoppingBag, FileText, LogIn, LogOut,
  MapPin, X, Download, ExternalLink, Loader2, Sparkles, Building2,
  MessageCircle, Send, Search, ShieldCheck, Inbox, Plus, Crown,
  Shirt, Utensils, Home, Palette, Briefcase, GraduationCap, Printer, Package, Store, Truck, ArrowLeft, TrendingUp, Check, Star, Flag, Ban, User, Trash2, Lock
} from 'lucide-react';

/* ---------------------------------------------------------
   Legal document viewer — renders lightweight markdown
--------------------------------------------------------- */

function LegalText({ text }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const clean = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1');
        if (line.startsWith('# ')) {
          return <h2 key={i} className="font-display text-xl text-ivory mt-2 mb-2">{clean(line.slice(2))}</h2>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={i} className="font-display text-base text-gold mt-4 mb-1">{clean(line.slice(3))}</h3>;
        }
        if (line.startsWith('### ')) {
          return <h4 key={i} className="font-sans font-semibold text-sm text-mint mt-3 mb-1">{clean(line.slice(4))}</h4>;
        }
        if (line.startsWith('- ')) {
          return <li key={i} className="text-sm text-ivory/85 ml-4 list-disc">{clean(line.slice(2))}</li>;
        }
        if (line.trim() === '') return null;
        const isStrongLine = line.startsWith('**') && line.endsWith('**');
        return (
          <p key={i} className={`text-sm ${isStrongLine ? 'font-semibold text-ivory' : 'text-ivory/85'}`}>
            {clean(line)}
          </p>
        );
      })}
    </div>
  );
}

function LegalModal({ title, text, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface max-w-lg w-full max-h-[80vh] flex flex-col border border-ivory/10 rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory/10">
          <h2 className="font-display text-lg text-ivory">{title}</h2>
          <button onClick={onClose} className="text-ivory/60 hover:text-ivory"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <LegalText text={text} />
        </div>
        <div className="px-6 py-3 border-t border-ivory/10">
          <GoldButton onClick={onClose}>Close</GoldButton>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Small shared UI bits
--------------------------------------------------------- */

function Logo({ className = 'h-8' }) {
  return (
    <img src="/logo.png" alt="The Boardroom JA" className={`${className} w-auto object-contain`} />
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] tracking-[0.14em] uppercase text-gold/80 font-medium mb-2">
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="text-center py-16 px-6">
      <Icon className="mx-auto mb-4 text-ivory/30" size={36} strokeWidth={1.25} />
      <h3 className="font-display text-lg text-ivory mb-1">{title}</h3>
      <p className="text-ivory/60 text-sm max-w-sm mx-auto">{body}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin text-gold" size={28} />
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface border border-ivory/[0.07] rounded-2xl ${className}`}>
      {children}
    </div>
  );
}

function GoldButton({ children, onClick, href, disabled, type = 'button', download }) {
  const cls = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full btn-gold text-navy text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed';
  // Only real web links are allowed. Blocks javascript: and other unsafe schemes in member-submitted links.
  const safeHref = href && /^(https?:\/\/|\/|#)/i.test(String(href).trim()) ? String(href).trim() : null;
  if (href && !safeHref) return null;
  if (safeHref) {
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer" className={cls} download={download || undefined}>
        {children}
      </a>
    );
  }
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

const inputCls = 'w-full px-4 py-3 rounded-xl border border-ivory/15 bg-navy/50 text-ivory placeholder-ivory/35 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold';

/* ---------------------------------------------------------
   Auth
--------------------------------------------------------- */

function AuthModal({ onClose, onAuthed }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showLegal, setShowLegal] = useState(null); // 'terms' | 'privacy' | null

  const needsConsent = mode === 'signup' && (!agreedTerms || !agreedPrivacy);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (needsConsent) {
      setError('Please agree to the Terms of Use and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: signErr } = await supabase.auth.signUp({ email, password });
        if (signErr) throw signErr;
        if (data.user) {
          await supabase.from('profiles').upsert({ id: data.user.id, full_name: fullName });
        }
      } else {
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) throw signErr;
      }
      onAuthed();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface max-w-sm w-full p-8 relative max-h-[90vh] overflow-y-auto border border-ivory/10 rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-ivory/60 hover:text-ivory">
          <X size={18} />
        </button>
        <Logo className="h-10 mb-6" />
        <h2 className="font-display text-xl text-ivory mb-1">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-sm text-ivory/60 mb-6">
          Beta. Join the room: 14 days of full membership free, then US$6.99/month. Cancel any time.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text" required placeholder="Full name" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
            />
          )}
          <input
            type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
          <input
            type="password" required placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className={inputCls}
          />

          {mode === 'signup' && (
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2 text-xs text-ivory/80">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5" />
                <span>
                  I agree to the{' '}
                  <button type="button" onClick={() => setShowLegal('terms')} className="text-mint underline">Terms of Use</button>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-ivory/80">
                <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="mt-0.5" />
                <span>
                  I agree to the{' '}
                  <button type="button" onClick={() => setShowLegal('privacy')} className="text-mint underline">Privacy Policy</button>
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs">{error}</p>}
          <GoldButton type="submit" disabled={loading || needsConsent}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : (mode === 'signup' ? 'Sign up' : 'Sign in')}
          </GoldButton>
        </form>
        <button
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          className="mt-4 text-xs text-mint hover:underline font-sans"
        >
          {mode === 'signup' ? 'Already a member? Sign in' : "New here? Create an account"}
        </button>
      </div>

      {showLegal === 'terms' && (
        <LegalModal title="Terms of Use" text={TERMS_OF_USE_TEXT} onClose={() => setShowLegal(null)} />
      )}
      {showLegal === 'privacy' && (
        <LegalModal title="Privacy Policy" text={PRIVACY_POLICY_TEXT} onClose={() => setShowLegal(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Reporting, blocking and the Account menu
--------------------------------------------------------- */

async function startMembershipCheckout() {
  const { data, error } = await supabase.functions.invoke('create-checkout-session');
  if (data?.url) { window.location.href = data.url; return null; }
  let msg = data?.error;
  if (!msg && error?.context?.json) { try { msg = (await error.context.json())?.error; } catch { /* ignore */ } }
  return msg || 'Could not start checkout. Please try again.';
}

const SOFT_GOLD_NOTE = 'Card required. Free for 14 days, then US$6.99 per month. Cancel any time.';

// Inside the iPhone/Android store app, only physical goods are sold. Digital products and the paid membership are bought on the website.
const IS_NATIVE_APP = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const REPORT_REASONS = ['Spam or scam', 'Fake or misleading', 'Harassment or abuse', 'Inappropriate content', 'Illegal or unsafe', 'Not eligible for the network', 'Something else'];

function ReportModal({ target, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');
  async function send(e) {
    e.preventDefault();
    if (!reason) return setErr('Please choose a reason.');
    setBusy(true); setErr('');
    const { data, error } = await supabase.functions.invoke('report-content', { body: { target_type: target.type, target_id: target.id, reason, details } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error || 'Could not send your report. Please try again.');
    setDone(data?.note || 'Thank you. We will review this within 24 hours and remove anything that breaks our rules.');
  }
  return (
    <FormModal title="Report" onClose={onClose}>
      {done ? (
        <div><p className="text-sm text-ivory/80 mb-4">{done}</p><GoldButton onClick={onClose}>Close</GoldButton></div>
      ) : (
        <form onSubmit={send}>
          <p className="text-xs text-ivory/60 mb-3">Tell us what is wrong. Your report is private and the person will not be told who sent it.</p>
          <div className="space-y-2 mb-3">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2.5 text-sm text-ivory/85 cursor-pointer">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[#D4A33A]" /> {r}
              </label>
            ))}
          </div>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} placeholder="Anything else we should know? (optional)" className={inputCls + ' mb-3'} />
          {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
          <GoldButton type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Send report'}</GoldButton>
        </form>
      )}
    </FormModal>
  );
}

function ReportLink({ user, onRequireAuth, type, id, label = 'Report' }) {
  const [open, setOpen] = useState(false);
  if (user && user.id === id) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); user ? setOpen(true) : onRequireAuth && onRequireAuth(); }} className="text-[11px] text-ivory/40 hover:text-ivory/75 inline-flex items-center gap-1" aria-label={label}>
        <Flag size={11} /> {label}
      </button>
      {open && <ReportModal target={{ type, id }} onClose={() => setOpen(false)} />}
    </>
  );
}

const CONTACT_EMAIL = 'lindsay@baxteradvisory.co.uk';

// Shown in place of a members-only area to anyone who is not an approved member yet.
function MembersOnlyNotice({ status, onApply, what }) {
  if (status === null) return <Spinner />;
  const text = status === 'pending'
    ? 'Your application is being reviewed. This opens as soon as you are approved. Meanwhile you can browse the Directory and buy from the Shop.'
    : status === 'declined'
      ? `Your application was not approved, so this part of the network is not available to you. You can still browse the Directory and buy from the Shop. Questions? Email ${CONTACT_EMAIL}.`
      : 'The Boardroom JA is a network for women in business. Everyone can browse the Directory and buy from the Shop. Apply to join to unlock this.';
  return (
    <div className="text-center max-w-md mx-auto">
      <EmptyState icon={Lock} title={`${what} is for members`} body={text} />
      {status === 'unconfirmed' && <GoldButton onClick={onApply}>Apply to join</GoldButton>}
    </div>
  );
}

// Admin only: review applications and remove access.
function AdminMembersModal({ onClose }) {
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setRows(null); setErr('');
    const { data, error } = await supabase.rpc('admin_list_members_v2', { p_status: tab });
    if (error) { setErr(error.message); setRows([]); return; }
    setRows(data || []);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function decide(r, decision) {
    const who = r.business_name || r.full_name || 'this member';
    if (decision === 'decline' && !window.confirm(`Decline ${who}? Their listing, shop and products will be hidden. If they pay for a membership, cancel it in Stripe too.`)) return;
    setBusyId(r.user_id); setErr('');
    const { error } = await supabase.rpc('admin_decide_member', { p_uid: r.user_id, p_decision: decision });
    setBusyId(null);
    if (error) return setErr(error.message);
    load();
  }

  const TAB_LIST = [['pending', 'Pending'], ['approved', 'Approved'], ['declined', 'Declined'], ['unconfirmed', 'Not applied']];
  return (
    <FormModal title="Review applications" onClose={onClose}>
      <div className="flex flex-wrap gap-2 mb-4">
        {TAB_LIST.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-3.5 py-1.5 text-xs font-medium rounded-full border ${tab === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
        ))}
      </div>
      {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-ivory/50">Nobody here.</p> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.user_id} className="rounded-2xl bg-navy/50 p-4 text-sm">
              <p className="font-semibold text-ivory">{r.business_name || 'No business details yet'}</p>
              <p className="text-ivory/75">{r.full_name || 'No name given'} · {r.email}</p>
              {(r.category || r.parish) && <p className="text-xs text-ivory/55 mt-1">{[r.category, r.parish].filter(Boolean).join(' · ')}</p>}
              {r.website_url && /^https?:\/\//i.test(r.website_url) && <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline inline-flex items-center gap-1">Website <ExternalLink size={11} /></a>}
              <p className="text-xs text-ivory/55">Registered: {r.is_registered || 'not given'}{r.registered_countries ? ` (${r.registered_countries})` : ''}</p>
              <p className="text-[11px] text-ivory/40 mt-1">{tab === 'unconfirmed' ? 'Signed up' : 'Applied'} {new Date(r.applied_at).toLocaleDateString()}</p>
              {r.trial_ends_at && <p className="text-xs text-gold mt-1">{new Date(r.trial_ends_at) > new Date() ? `Beta trial ends ${new Date(r.trial_ends_at).toLocaleDateString()}` : `Beta trial ended ${new Date(r.trial_ends_at).toLocaleDateString()}`}</p>}
              {tab !== 'unconfirmed' && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                  {tab !== 'approved' && <GoldButton onClick={() => decide(r, 'approve')} disabled={busyId === r.user_id}>Approve</GoldButton>}
                  {!r.trial_ends_at && r.tier !== 'paid' && <button onClick={() => decide(r, 'approve_beta')} disabled={busyId === r.user_id} className="text-sm text-gold underline underline-offset-2">{tab === 'approved' ? 'Give 14 day beta trial (no card)' : 'Approve as beta tester (14 days, no card)'}</button>}
                  {tab !== 'declined' && <button onClick={() => decide(r, 'decline')} disabled={busyId === r.user_id} className="text-sm text-[#F2B8C2] hover:text-rose underline underline-offset-2">{tab === 'approved' ? 'Remove access' : 'Decline'}</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
}

function AccountModal({ user, profile, betaActive, betaDaysLeft, onSubscribe, onClose, onLegal }) {
  const [blocks, setBlocks] = useState(null);
  const [step, setStep] = useState('menu'); // menu | confirm
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [billBusy, setBillBusy] = useState(false);
  const [billErr, setBillErr] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const accessLabel = profile?.member_status === 'approved' ? 'Network member' : profile?.member_status === 'pending' ? 'Application under review' : profile?.member_status === 'declined' ? 'Application not approved' : 'Buyer access (browse the Directory and buy from the Shop)';
  const betaEnded = !!profile?.trial_ends_at && !betaActive && profile?.membership_tier !== 'paid' && !profile?.membership_status;
  const planLabel = betaActive ? `Beta trial, full membership (${betaDaysLeft} ${betaDaysLeft === 1 ? 'day' : 'days'} left, no card taken)` : betaEnded ? 'Free (beta trial ended)' : profile?.membership_status === 'trialing' ? 'Free trial (full membership)' : profile?.membership_tier === 'paid' ? 'Member' : profile?.membership_status === 'canceled' ? 'Free (membership ended)' : 'Free';

  async function manageBilling() {
    setBillBusy(true); setBillErr('');
    const { data, error } = await supabase.functions.invoke('manage-billing');
    if (data?.url) { window.location.href = data.url; return; }
    let msg = data?.error;
    if (!msg && error?.context?.json) { try { msg = (await error.context.json())?.error; } catch { /* ignore */ } }
    setBillErr(msg || 'Could not open billing. Please try again.');
    setBillBusy(false);
  }

  const loadBlocks = useCallback(async () => {
    const { data: b } = await supabase.from('user_blocks').select('blocked_id, created_at').order('created_at', { ascending: false });
    const ids = (b || []).map((x) => x.blocked_id);
    let names = {};
    if (ids.length) {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, business_name').in('id', ids),
        supabase.from('business_directory').select('user_id, business_name').in('user_id', ids),
      ]);
      (p || []).forEach((x) => { names[x.id] = x.business_name || x.full_name; });
      (d || []).forEach((x) => { names[x.user_id] = x.business_name; });
    }
    setBlocks((b || []).map((x) => ({ id: x.blocked_id, name: names[x.blocked_id] || 'A member' })));
  }, []);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  async function unblock(id) {
    await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id);
    loadBlocks();
  }

  async function deleteAccount() {
    setBusy(true); setErr('');
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    if (error || data?.error) {
      let msg = data?.error;
      if (!msg && error?.context?.json) { try { msg = (await error.context.json())?.error; } catch { /* ignore */ } }
      setBusy(false);
      return setErr(msg || 'We could not delete your account. Please try again or contact us.');
    }
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <FormModal title="My account" onClose={onClose}>
      {step === 'menu' ? (
        <div className="space-y-6">
          <div>
            <p className="text-xs text-ivory/50 mb-0.5">Signed in as</p>
            <p className="text-sm text-ivory">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-ivory/50 mb-0.5">Network access</p>
            <p className="text-sm text-ivory">{accessLabel}</p>
            {profile?.is_admin && <button onClick={() => setShowAdmin(true)} className="text-sm text-gold underline underline-offset-2 mt-2">Review applications</button>}
          </div>
          <div>
            <p className="text-xs text-ivory/50 mb-0.5">Membership</p>
            <p className="text-sm text-ivory mb-2">{planLabel}</p>
            {profile?.member_status === 'approved' && (betaActive || betaEnded) && !IS_NATIVE_APP && (
              <button onClick={onSubscribe} className="text-sm text-gold underline underline-offset-2 block mb-1">Subscribe, US$6.99 per month</button>
            )}
            {profile?.membership_status && profile.membership_status !== 'canceled' && (
              <button onClick={manageBilling} disabled={billBusy} className="text-sm text-gold underline underline-offset-2">{billBusy ? 'Opening…' : 'Manage or cancel membership'}</button>
            )}
            {billErr && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mt-2">{billErr}</p>}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <button onClick={() => onLegal('terms')} className="text-gold underline underline-offset-2">Terms of Use</button>
            <button onClick={() => onLegal('privacy')} className="text-gold underline underline-offset-2">Privacy Policy</button>
          </div>
          <div>
            <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Blocked members</h4>
            {blocks === null ? <Spinner /> : blocks.length === 0 ? <p className="text-sm text-ivory/50">You have not blocked anyone.</p> : (
              <div className="space-y-2">
                {blocks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl bg-navy/50 px-4 py-2.5 text-sm">
                    <span className="text-ivory">{b.name}</span>
                    <button onClick={() => unblock(b.id)} className="text-xs text-gold underline underline-offset-2">Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-ivory/10 pt-4">
            <button onClick={() => setStep('confirm')} className="text-sm text-[#F2B8C2] hover:text-rose inline-flex items-center gap-1.5"><Trash2 size={14} /> Delete my account</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-ivory/85 mb-3">This permanently deletes your account, messages, directory listing and uploads, and cancels any paid membership so you are not charged again.</p>
          <p className="text-xs text-ivory/60 mb-3">If you have bought from or sold in the Shop, we must keep the bare financial records (amounts and dates, not your name or contact details) for tax law. Your personal details on those are erased.</p>
          <label className="text-xs font-medium text-ivory/60 block mb-1.5">Type DELETE to confirm</label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputCls + ' mb-3'} autoComplete="off" />
          {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
          <div className="flex items-center gap-4">
            <GoldButton onClick={deleteAccount} disabled={busy || confirmText !== 'DELETE'}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Delete forever'}</GoldButton>
            <button onClick={() => { setStep('menu'); setErr(''); setConfirmText(''); }} className="text-sm text-ivory/70 hover:text-ivory">Cancel</button>
          </div>
        </div>
      )}
      {showAdmin && <AdminMembersModal onClose={() => setShowAdmin(false)} />}
    </FormModal>
  );
}

/* ---------------------------------------------------------
   Message thread modal — encrypted at rest, decrypted only
   for the two participants via the get_message_thread RPC
--------------------------------------------------------- */

function MessageThreadModal({ user, otherUserId, otherName, onClose }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);

  async function blockThem() {
    if (!window.confirm(`Block ${otherName}? You will not see each other's messages and they cannot message you. You can unblock in My account.`)) return;
    const { error: err } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: otherUserId });
    if (err && err.code !== '23505') return setError('Could not block this member. Please try again.');
    onClose();
  }

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_message_thread', { other_user_id: otherUserId });
    if (err) setError(err.message);
    setMessages(data || []);
  }, [otherUserId]);

  useEffect(() => { load(); }, [load]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    const { error: err } = await supabase.from('messages').insert({
      sender_id: user.id,
      recipient_id: otherUserId,
      body: text.trim(),
    });
    if (err) {
      setError(err.code === '42501' || /row-level security/i.test(err.message) ? "This member can't receive messages yet. Members need an active membership, or a Skillswap post, to be contacted." : err.message);
    } else {
      setText('');
      await load();
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface max-w-md w-full h-[70vh] flex flex-col border border-ivory/10 rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ivory/10 bg-navy text-ivory">
          <div>
            <p className="font-sans font-semibold text-base tracking-tight">{otherName}</p>
            <p className="text-[11px] flex items-center gap-1 text-gold"><ShieldCheck size={12} /> Encrypted message thread</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setReporting(true)} className="text-ivory/60 hover:text-ivory" aria-label="Report" title="Report"><Flag size={16} /></button>
            <button onClick={blockThem} className="text-ivory/60 hover:text-ivory" aria-label="Block" title="Block this member"><Ban size={16} /></button>
            <button onClick={onClose} className="text-ivory/75 hover:text-ivory"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto px-5 py-4 space-y-3">
          {messages === null ? <Spinner /> : messages.length === 0 ? (
            <p className="text-sm text-ivory/55 text-center pt-8">No messages yet. Say hello.</p>
          ) : messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-2.5 text-sm rounded-2xl ${mine ? 'bg-emerald text-ivory' : 'bg-navy/50 border border-ivory/10 text-ivory'}`}>
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-ivory/10 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className={inputCls + ' flex-grow'}
          />
          <button type="submit" disabled={sending} className="px-4 bg-gold text-navy disabled:opacity-40">
            {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          </button>
        </form>
        {error && <p className="text-[#F2B8C2] bg-wine/60 text-xs px-3 py-2">{error}</p>}
      </div>
      {reporting && <ReportModal target={{ type: 'member', id: otherUserId }} onClose={() => setReporting(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   Directory tab
--------------------------------------------------------- */

const DIRECTORY_REQUIRED = ['business_name', 'category', 'description', 'parish', 'contact_email'];

function ListBusinessForm({ user, existing, onClose, onSaved, onboarding = false, pendingReview = false }) {
  const [form, setForm] = useState({
    business_name: existing?.business_name || '',
    category: existing?.category || '',
    description: existing?.description || '',
    parish: existing?.parish || '',
    website_url: existing?.website_url || '',
    is_registered: '',
    registered_countries: '',
    contact_email: '',
    phone: '',
    full_name: '',
  });
  const [consent, setConsent] = useState(existing ? existing.is_active !== false : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ data: priv }, { data: prof }] = await Promise.all([
        supabase.from('business_private').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);
      if (!live) return;
      setForm((f) => ({
        ...f,
        is_registered: priv?.is_registered || f.is_registered,
        registered_countries: priv?.registered_countries || '',
        contact_email: priv?.contact_email || existing?.contact_email || user.email || '',
        phone: priv?.phone || existing?.phone || '',
        full_name: prof?.full_name || '',
      }));
    })();
    return () => { live = false; };
  }, [user.id, user.email, existing]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const need = ['business_name', 'category', 'description', 'parish', 'contact_email', 'is_registered'];
    if (need.some((f) => !form[f]?.trim())) return setError('Please fill in all required fields.');
    if (form.is_registered !== 'no' && !form.registered_countries.trim()) return setError('Please tell us which country or countries the business is registered in.');
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const { error: e1 } = await supabase.from('business_private').upsert({
      user_id: user.id,
      is_registered: form.is_registered,
      registered_countries: form.is_registered === 'no' ? null : form.registered_countries.trim(),
      contact_email: form.contact_email.trim(),
      phone: form.phone.trim() || null,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (e1) { setSaving(false); return setError(e1.message); }
    if (form.full_name.trim()) await supabase.from('profiles').update({ full_name: form.full_name.trim() }).eq('id', user.id);
    // Contact details are kept private, so the public listing row never carries them.
    const { error: e2 } = await supabase.from('business_directory').upsert({
      user_id: user.id,
      business_name: form.business_name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      parish: form.parish.trim(),
      website_url: form.website_url.trim() || null,
      contact_email: '',
      phone: null,
      is_active: consent,
      directory_consent_at: consent ? (existing?.directory_consent_at || now) : null,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (e2) return setError(e2.message);
    onSaved();
    if (!onboarding) onClose();
  }

  const lbl = (text, req, hint) => (
    <label className="text-xs font-medium text-ivory/60 block mb-1.5">
      {text}{req && <span className="text-gold"> *</span>}
      {hint && <span className="ml-2 text-[10px] font-normal text-mint">{hint}</span>}
    </label>
  );
  const PUBLIC = 'Shown publicly';
  const PRIVATE = 'Not shared publicly';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface max-w-lg w-full p-7 my-8 border border-ivory/10 rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-display text-xl text-ivory">{onboarding ? 'Welcome. Tell us about your business' : existing ? 'Edit your listing' : 'List your business'}</h2>
          <button onClick={onClose} className="text-ivory/60 hover:text-ivory" aria-label="Close"><X size={18} /></button>
        </div>
        {onboarding && <p className="text-xs text-ivory/60 mb-4">{pendingReview ? 'Our team reviews every application. Only the fields marked "Shown publicly" will appear to other people, and only once you are approved.' : 'This sets up your Directory listing. Only the fields marked "Shown publicly" appear to other people.'}</p>}
        <form onSubmit={handleSubmit} className={onboarding ? '' : 'mt-3'}>
          <div className="mb-3">{lbl('Business name', true, PUBLIC)}<input className={inputCls} value={form.business_name} onChange={(e) => update('business_name', e.target.value)} /></div>
          <div className="mb-3">{lbl('Industry / category', true, PUBLIC)}<input className={inputCls} value={form.category} onChange={(e) => update('category', e.target.value)} /></div>
          <div className="mb-3">{lbl('Description', true, PUBLIC)}<textarea rows={3} className={inputCls} value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
          <div className="mb-3">{lbl('Parish', true, PUBLIC)}<input className={inputCls} value={form.parish} onChange={(e) => update('parish', e.target.value)} /></div>
          <div className="mb-5">{lbl('Website', false, PUBLIC)}<input className={inputCls} value={form.website_url} onChange={(e) => update('website_url', e.target.value)} placeholder="https://" /></div>

          <div className="rounded-2xl bg-navy/40 border border-ivory/10 p-4 mb-4">
            <p className="text-xs font-medium tracking-[0.12em] uppercase text-gold/80 mb-3">Private. Only our team sees this</p>
            <div className="mb-3">{lbl('Is the business registered?', true, PRIVATE)}
              <select className={inputCls} value={form.is_registered} onChange={(e) => update('is_registered', e.target.value)}>
                <option value="">Choose…</option>
                <option value="yes">Yes, it is registered</option>
                <option value="in_progress">Registration in progress</option>
                <option value="no">Not registered</option>
              </select>
            </div>
            {form.is_registered && form.is_registered !== 'no' && (
              <div className="mb-3">{lbl('Which country or countries is it registered in?', true, PRIVATE)}<input className={inputCls} value={form.registered_countries} onChange={(e) => update('registered_countries', e.target.value)} placeholder="e.g. Jamaica, United Kingdom" /></div>
            )}
            <div className="mb-3">{lbl('Your name', false, PRIVATE)}<input className={inputCls} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} /></div>
            <div className="mb-3">{lbl('Contact email', true, PRIVATE)}<input type="email" className={inputCls} value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} /></div>
            <div>{lbl('Phone / WhatsApp', false, PRIVATE)}<input className={inputCls} value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-ivory/80 mb-4 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
            <span>Show my business in the member Directory (business name, category, description, parish and website only). You can change this any time. Other members can message you if you have an active membership.</span>
          </label>

          {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
          <div className="flex items-center gap-4">
            <GoldButton type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : onboarding ? 'Save and continue' : existing ? 'Save changes' : 'Save listing'}
            </GoldButton>
            {onboarding && <button type="button" onClick={onClose} className="text-sm text-ivory/60 hover:text-ivory">Do this later</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function DirectoryTab({ user, onRequireAuth, isPaid, onUpgrade, isApproved, status, onApply }) {
  const [businesses, setBusinesses] = useState(null);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [myListing, setMyListing] = useState(null);
  const [thread, setThread] = useState(null); // { otherUserId, otherName }
  const [messageable, setMessageable] = useState(new Set());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('business_directory')
      .select('id, user_id, business_name, category, description, parish, website_url, logo_url, is_active, created_at')
      .eq('is_active', true)
      .order('business_name', { ascending: true });
    let blockedIds = new Set();
    if (user) {
      const { data: bl } = await supabase.from('user_blocks').select('blocked_id');
      blockedIds = new Set((bl || []).map((x) => x.blocked_id));
    }
    if (user && (data || []).length) {
      const { data: mm } = await supabase.rpc('messageable_ids', { p_ids: data.map((b) => b.user_id) });
      setMessageable(new Set(mm || []));
    }
    const { data: sr } = await supabase.from('seller_ratings').select('*');
    const smap = Object.fromEntries((sr || []).map((r) => [r.seller_id, r]));
    setBusinesses((data || []).filter((b) => !blockedIds.has(b.user_id)).map((b) => ({ ...b, avg_rating: smap[b.user_id]?.avg_rating, review_count: smap[b.user_id]?.review_count || 0 })));

    if (user) {
      const { data: mine } = await supabase
        .from('business_directory')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      setMyListing(mine || null);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function handleAddClick() {
    if (!user) return onRequireAuth();
    if (status === null) return;
    if (!isApproved) return onApply();
    setShowForm(true);
  }

  function handleMessageClick(biz) {
    if (!user) return onRequireAuth();
    if (biz.user_id === user.id) return;
    setThread({ otherUserId: biz.user_id, otherName: biz.business_name });
  }

  const filtered = (businesses || []).filter((b) => {
    const q = query.toLowerCase();
    return !q || b.business_name.toLowerCase().includes(q) || b.category?.toLowerCase().includes(q) || b.parish?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-grow">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, industry, or parish…"
            className={inputCls + ' pl-9'}
          />
        </div>
        <GoldButton onClick={handleAddClick}>
          <Plus size={14} /> {isApproved || status === null ? (myListing ? 'Edit my listing' : 'List my business') : status === 'pending' ? 'Application pending' : status === 'declined' ? 'Not available' : 'Apply to join'}
        </GoldButton>
      </div>

      {user && myListing && !isApproved && status !== null && (
        <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3 text-sm text-ivory/85 mb-5">{status === 'pending' ? 'Your listing will appear here once your application is approved.' : 'Your listing is not shown because your application was not approved.'}</div>
      )}
      {user && myListing && isApproved && myListing.is_active === false && (
        <div className="rounded-2xl bg-wine/40 border border-wine px-4 py-3 text-sm text-ivory/85 mb-5">Your listing is hidden. Edit it and tick "Show my business in the member Directory" to appear here.</div>
      )}
      {user && myListing && isApproved && myListing.is_active !== false && !isPaid && (
        <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3 text-sm text-ivory/85 mb-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <span>Your listing is live. Only members can receive messages from other businesses. Start your 14 day free trial to be contactable.</span>
          <GoldButton onClick={onUpgrade}>Start free trial</GoldButton>
        </div>
      )}

      {businesses === null ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No businesses found" body="Try a different search, or be the first to list your business." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((b) => (
            <Card key={b.id} className="p-5 flex flex-col">
              <SectionLabel>{b.category}</SectionLabel>
              <h3 className="font-sans font-semibold text-lg tracking-tight text-ivory mb-1">{b.business_name}</h3>
              <p className="text-xs text-ivory/55 mb-2 flex items-center gap-1"><MapPin size={12} /> {b.parish}</p>
              {b.review_count > 0 && <div className="mb-2 flex items-center gap-2"><StarRating value={b.avg_rating} count={b.review_count} /><span className="text-[11px] text-ivory/45">verified shop buyers</span></div>}
              <p className="text-sm text-ivory/75 mb-4 flex-grow line-clamp-4">{b.description}</p>
              <div className="flex items-center gap-2 mt-auto pt-2">
                {b.website_url && (
                  <a href={b.website_url.startsWith('http') ? b.website_url : `https://${b.website_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline flex items-center gap-1">
                    Website <ExternalLink size={11} />
                  </a>
                )}
                <div className="flex-grow" />
                <ReportLink user={user} onRequireAuth={onRequireAuth} type="listing" id={b.id} />
                {b.user_id !== user?.id && (!user || messageable.has(b.user_id) ? (
                  <GoldButton onClick={() => handleMessageClick(b)}>
                    <MessageCircle size={14} /> Message
                  </GoldButton>
                ) : (
                  isApproved ? <span className="text-[11px] text-ivory/40">Not taking messages yet</span> : null
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ListBusinessForm
          user={user}
          existing={myListing}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}
      {thread && (
        <MessageThreadModal
          user={user}
          otherUserId={thread.otherUserId}
          otherName={thread.otherName}
          onClose={() => setThread(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Messages inbox tab
--------------------------------------------------------- */

function MessagesTab({ user, onRequireAuth, isApproved, status, onApply }) {
  const [conversations, setConversations] = useState(null);
  const [thread, setThread] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: convos } = await supabase.rpc('get_my_conversations');
    if (!convos || convos.length === 0) {
      setConversations([]);
      return;
    }
    const otherIds = convos.map((c) => c.other_user_id);
    const [{ data: profiles }, { data: bizzes }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, business_name').in('id', otherIds),
      supabase.from('business_directory').select('user_id, business_name').in('user_id', otherIds),
    ]);
    const nameFor = (id) => {
      const biz = bizzes?.find((b) => b.user_id === id);
      if (biz) return biz.business_name;
      const p = profiles?.find((p) => p.id === id);
      return p?.business_name || p?.full_name || 'A member';
    };
    setConversations(convos.map((c) => ({ ...c, name: nameFor(c.other_user_id) })));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <div className="text-center py-16">
        <EmptyState icon={Inbox} title="Sign in to view messages" body="Your conversations with other members will appear here." />
        <GoldButton onClick={onRequireAuth}>Sign in</GoldButton>
      </div>
    );
  }

  if (!isApproved) return <MembersOnlyNotice status={status} onApply={onApply} what="Messaging" />;
  if (conversations === null) return <Spinner />;
  if (conversations.length === 0) {
    return <EmptyState icon={Inbox} title="No messages yet" body="Message a business from the Directory to start a conversation." />;
  }

  return (
    <div className="space-y-2">
      {conversations.map((c) => (
        <button
          key={c.other_user_id}
          onClick={() => setThread({ otherUserId: c.other_user_id, otherName: c.name })}
          className="w-full text-left"
        >
          <Card className="p-4 flex items-center justify-between hover:border-gold/50 transition-colors">
            <div className="flex items-center gap-3">
              <MessageCircle size={16} className="text-mint" />
              <span className="font-sans font-semibold text-ivory text-sm">{c.name}</span>
            </div>
            <span className="text-xs text-ivory/45">{new Date(c.last_message_at).toLocaleDateString()}</span>
          </Card>
        </button>
      ))}
      {thread && (
        <MessageThreadModal
          user={user}
          otherUserId={thread.otherUserId}
          otherName={thread.otherName}
          onClose={() => { setThread(null); load(); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Listing helpers: fee notice + submit forms
--------------------------------------------------------- */

function FeeNotice({ onReadTerms, paid = true }) {
  return (
    <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3 text-sm text-ivory/85">
      <p className="font-semibold text-gold mb-1">Free to list</p>
      <p>
        Listing costs nothing{paid ? `. If you sell tickets or products, The Boardroom JA keeps ${COMMISSION_PCT}% of the sale after Stripe transaction fees, and you are paid within ${PAYMENT_TERMS_DAYS} days.` : ', and free events stay free.'}
      </p>
      {paid && (
        <button type="button" onClick={onReadTerms} className="mt-2 text-xs font-medium text-gold underline underline-offset-2">
          See Stripe fees and Seller Terms
        </button>
      )}
    </div>
  );
}

function SellerAgree({ checked, onChange, onReadTerms }) {
  return (
    <label className="flex items-start gap-2.5 text-xs text-ivory/75 mb-4 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
      <span>
        I agree to the{' '}
        <button type="button" onClick={onReadTerms} className="text-gold underline underline-offset-2">Seller and Organizer Terms</button>
        {' '}including the {COMMISSION_PCT}% commission after Stripe fees and {PAYMENT_TERMS_DAYS} day payment terms.
      </span>
    </label>
  );
}

function FormModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface max-w-lg w-full p-7 my-8 border border-ivory/10 rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-display text-xl text-ivory">{title}</h2>
          <button onClick={onClose} className="text-ivory/60 hover:text-ivory"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FField({ label, required, children }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium text-ivory/60 block mb-1.5">
        {label}{required && <span className="text-gold"> *</span>}
      </label>
      {children}
    </div>
  );
}

function EventForm({ user, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', description: '', event_date: '', location: '', host_name: '', event_type: 'rsvp', price_text: '', ticket_checkout_url: '', external_url: '' });
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ticketed = f.event_type === 'ticketed';

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !f.event_date) return setError('Please add a title and a date.');
    if (ticketed && (!f.price_text.trim() || !f.ticket_checkout_url.trim())) return setError('Ticketed events need a price and a ticket link.');
    if (ticketed && !agreed) return setError('Please agree to the Seller and Organizer Terms.');
    setSaving(true); setError('');
    const { error: err } = await supabase.from('events').insert({
      title: f.title.trim(),
      description: f.description.trim() || null,
      event_date: new Date(f.event_date).toISOString(),
      location: f.location.trim() || null,
      host_name: f.host_name.trim() || null,
      event_type: f.event_type,
      price_text: ticketed ? f.price_text.trim() : 'Free',
      ticket_checkout_url: ticketed ? f.ticket_checkout_url.trim() : null,
      external_url: f.external_url.trim() || null,
      created_by: user.id,
      review_status: 'pending',
      is_active: true,
      ...(ticketed ? { seller_terms_accepted_at: new Date().toISOString() } : {}),
    });
    setSaving(false);
    if (err) return setError(err.message);
    onSaved();
  }

  return (
    <FormModal title="List an event" onClose={onClose}>
      <div className="mb-4"><FeeNotice paid={ticketed} onReadTerms={() => setShowTerms(true)} /></div>
      <form onSubmit={submit}>
        <FField label="Event name" required><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} /></FField>
        <FField label="Date and time" required><input type="datetime-local" className={inputCls} value={f.event_date} onChange={(e) => set('event_date', e.target.value)} /></FField>
        <FField label="Location"><input className={inputCls} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Venue, or Online" /></FField>
        <FField label="Hosted by"><input className={inputCls} value={f.host_name} onChange={(e) => set('host_name', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Event type">
          <div className="flex gap-2">
            {[['rsvp', 'Free (RSVP)'], ['ticketed', 'Ticketed']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('event_type', v)}
                className={`px-4 py-2 text-sm font-medium rounded-full border ${f.event_type === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
            ))}
          </div>
        </FField>
        {ticketed && (
          <>
            <FField label="Ticket price" required><input className={inputCls} value={f.price_text} onChange={(e) => set('price_text', e.target.value)} placeholder="e.g. US$25" /></FField>
            <FField label="Ticket payment link" required><input className={inputCls} value={f.ticket_checkout_url} onChange={(e) => set('ticket_checkout_url', e.target.value)} placeholder="https://" /></FField>
            <SellerAgree checked={agreed} onChange={setAgreed} onReadTerms={() => setShowTerms(true)} />
          </>
        )}
        {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
        <p className="text-xs text-ivory/50 mb-4">We review every listing before it goes live, usually within a couple of days.</p>
        <GoldButton type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Submit for review'}</GoldButton>
      </form>
      {showTerms && <LegalModal title="Seller and Organizer Terms" text={SELLER_TERMS_TEXT} onClose={() => setShowTerms(false)} />}
    </FormModal>
  );
}

function SubmittedNote({ onDismiss }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-mint/10 border border-mint/25 px-4 py-3 text-sm text-mint">
      <span>Thanks, your listing is in. We'll review it and it will appear once approved.</span>
      <button onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}


/* ---------------------------------------------------------
   Events tab
--------------------------------------------------------- */

function EventsTab({ user, onRequireAuth }) {
  const [events, setEvents] = useState(null);
  const [rsvpdIds, setRsvpdIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)
      .eq('review_status', 'approved')
      .order('event_date', { ascending: true });
    setEvents(data || []);

    if (user) {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('event_id')
        .eq('user_id', user.id);
      setRsvpdIds(new Set((rsvps || []).map((r) => r.event_id)));
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleRsvp(eventId) {
    if (!user) return onRequireAuth();
    setBusyId(eventId);
    await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: user.id });
    await load();
    setBusyId(null);
  }

  if (events === null) return <Spinner />;

  const listBar = (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-sm text-ivory/60">Hosting something? It's free to list your event.</p>
      <GoldButton onClick={() => (user ? setShowForm(true) : onRequireAuth())}><Plus size={15} /> List an event</GoldButton>
    </div>
  );
  const formModal = showForm && (
    <EventForm user={user} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setSubmitted(true); }} />
  );

  if (events.length === 0) {
    return (
      <div>
        {submitted && <SubmittedNote onDismiss={() => setSubmitted(false)} />}
        {listBar}
        <EmptyState icon={Calendar} title="No events yet" body="Upcoming events will appear here. Be the first to list one." />
        {formModal}
      </div>
    );
  }

  return (
    <div>
    {submitted && <SubmittedNote onDismiss={() => setSubmitted(false)} />}
    {listBar}
    {formModal}
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((ev) => {
        const going = rsvpdIds.has(ev.id);
        const date = ev.event_date ? new Date(ev.event_date) : null;
        return (
          <Card key={ev.id} className="p-5 flex flex-col">
            <SectionLabel>{ev.event_type === 'ticketed' ? 'Ticketed' : 'RSVP'}</SectionLabel>
            <h3 className="font-sans font-semibold text-lg tracking-tight text-ivory mb-1">{ev.title}</h3>
            {date && (
              <p className="text-xs text-ivory/55 mb-2 font-sans">
                {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            {ev.location && (
              <p className="text-xs text-ivory/55 mb-3 flex items-center gap-1"><MapPin size={12} /> {ev.location}</p>
            )}
            {ev.description && <p className="text-sm text-ivory/75 mb-4 flex-grow">{ev.description}</p>}
            <div className="flex items-center justify-between mt-auto pt-2">
              <span className="text-sm font-semibold text-mint">{ev.price_text || 'Free'}</span>
              {ev.event_type === 'ticketed' && ev.ticket_checkout_url ? (
                <GoldButton href={ev.ticket_checkout_url}>Get ticket</GoldButton>
              ) : (
                <GoldButton onClick={() => handleRsvp(ev.id)} disabled={going || busyId === ev.id}>
                  {busyId === ev.id ? <Loader2 className="animate-spin" size={14} /> : going ? "You're going" : 'RSVP'}
                </GoldButton>
              )}
            </div>
            {ev.event_type === 'ticketed' && <p className="text-[11px] text-ivory/45 mt-2">Tickets are sold by the organiser on their own page. The Boardroom JA does not take this payment, so check the details before you pay.</p>}
            <div className="mt-2"><ReportLink user={user} onRequireAuth={onRequireAuth} type="event" id={ev.id} /></div>
          </Card>
        );
      })}
    </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Skillswap tab
--------------------------------------------------------- */

function SkillswapTab({ user, onRequireAuth, isApproved, status, onApply }) {
  const [offers, setOffers] = useState(null);
  const [wants, setWants] = useState(null);
  const [view, setView] = useState('offers');
  const [skillInput, setSkillInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [thread, setThread] = useState(null); // { otherUserId, otherName }

  const load = useCallback(async () => {
    const [{ data: o }, { data: w }] = await Promise.all([
      supabase.from('skill_offers').select('*, profiles(full_name, business_name)').order('created_at', { ascending: false }),
      supabase.from('skill_wants').select('*, profiles(full_name, business_name)').order('created_at', { ascending: false }),
    ]);
    setOffers(o || []);
    setWants(w || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handlePost(e) {
    e.preventDefault();
    if (!user) return onRequireAuth();
    if (!skillInput.trim()) return;
    setPosting(true);
    const table = view === 'offers' ? 'skill_offers' : 'skill_wants';
    await supabase.from(table).insert({ user_id: user.id, skill: skillInput.trim() });
    setSkillInput('');
    await load();
    setPosting(false);
  }

  function nameFor(item) {
    return item.profiles?.full_name || item.profiles?.business_name || 'A member';
  }

  function handleMessageClick(item) {
    if (!user) return onRequireAuth();
    if (item.user_id === user.id) return;
    setThread({ otherUserId: item.user_id, otherName: nameFor(item) });
  }

  const list = view === 'offers' ? offers : wants;

  if (!isApproved) return <MembersOnlyNotice status={status} onApply={onApply} what="Skillswap" />;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {['offers', 'wants'].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium rounded-full border ${view === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70 hover:border-ivory/40'}`}
          >
            {v === 'offers' ? 'Skills offered' : 'Skills wanted'}
          </button>
        ))}
      </div>

      <form onSubmit={handlePost} className="flex gap-2 mb-8">
        <input
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          placeholder={view === 'offers' ? 'A skill you can offer, e.g. "Bookkeeping"' : 'A skill you need, e.g. "Logo design"'}
          className={inputCls + ' flex-grow'}
        />
        <GoldButton type="submit" disabled={posting}>
          {posting ? <Loader2 className="animate-spin" size={14} /> : 'Post'}
        </GoldButton>
      </form>

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={Users} title="Nothing posted yet" body="Be the first to post a skill in this category." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((item) => {
            const isMine = item.user_id === user?.id;
            return (
              <Card key={item.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ivory text-sm truncate">{item.skill}</p>
                  <p className="text-xs text-ivory/55 truncate">{nameFor(item)}</p>
                </div>
                {!isMine && (
                  <button
                    onClick={() => handleMessageClick(item)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs uppercase tracking-wide text-mint hover:underline"
                  >
                    <MessageCircle size={13} /> Message
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {thread && (
        <MessageThreadModal
          user={user}
          otherUserId={thread.otherUserId}
          otherName={thread.otherName}
          onClose={() => setThread(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Shop tab
--------------------------------------------------------- */

/* ---------------------------------------------------------
   Shop tab: categories, search, seller shops, orders
--------------------------------------------------------- */

const SHOP_CATEGORIES = [
  { name: 'Beauty & Wellness', icon: Sparkles },
  { name: 'Fashion & Accessories', icon: Shirt },
  { name: 'Food & Drink', icon: Utensils },
  { name: 'Home & Living', icon: Home },
  { name: 'Art & Crafts', icon: Palette },
  { name: 'Print & Stationery', icon: Printer },
  { name: 'Business Services', icon: Briefcase },
  { name: 'Courses & Coaching', icon: GraduationCap },
  { name: 'Templates & Downloads', icon: Download },
  { name: 'Other', icon: Package },
];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD'];

function formatMoney(cents, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shop';
}

async function fnErrorMessage(error) {
  try {
    const body = await error.context.json();
    if (body?.error) return body.error;
  } catch { /* ignore */ }
  return error.message || 'Something went wrong. Please try again.';
}

function TypeBadge({ type }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ivory/70 bg-ivory/[0.07] rounded-full px-2.5 py-1">
      {type === 'digital' ? <Download size={11} /> : <Truck size={11} />}
      {type === 'digital' ? 'Digital' : 'Physical'}
    </span>
  );
}


function StarRating({ value, count, size = 13, showCount = true }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ivory/70" title={`${value} out of 5 from ${count} verified purchase${count === 1 ? '' : 's'}`}>
      <Star size={size} className="text-gold" fill="currentColor" strokeWidth={0} />
      <span className="font-semibold text-ivory">{Number(value).toFixed(1)}</span>
      {showCount && <span className="text-ivory/50">({count})</span>}
    </span>
  );
}

function StarInput({ value, onChange }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)} className="p-0.5">
          <Star size={26} className={n <= value ? 'text-gold' : 'text-ivory/25'} fill={n <= value ? 'currentColor' : 'none'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function RateOrder({ order, existing, onDone }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (existing) {
    return <p className="text-xs text-ivory/55 mt-1 flex items-center gap-1">You rated this <StarRating value={existing.rating} count={1} showCount={false} /></p>;
  }
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-xs text-gold underline underline-offset-2 mt-1 flex items-center gap-1"><Star size={12} /> Rate this purchase</button>;
  }
  async function submit() {
    if (!rating) { setErr('Please tap a star rating.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('submit_review', { p_order_id: order.id, p_rating: rating, p_comment: comment });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); onDone();
  }
  return (
    <div className="mt-3 rounded-xl bg-navy/70 p-3">
      <StarInput value={rating} onChange={setRating} />
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2}
        placeholder="Optional comment. Please don't include personal details."
        className={`${inputCls} mt-2`} />
      <p className="text-[11px] text-ivory/45 mt-1">Your first name, rating and comment will be shown publicly on the product and on the seller's directory listing.</p>
      {err && <p className="text-xs text-[#F2B8C2] bg-wine/60 border border-wine rounded-lg px-3 py-2 mt-2">{err}</p>}
      <div className="flex gap-2 mt-2">
        <GoldButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Submit rating'}</GoldButton>
        <button onClick={() => setOpen(false)} className="text-xs text-ivory/60 px-3">Cancel</button>
      </div>
    </div>
  );
}

function CountrySelect({ value, onChange }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a country</option>
      {COUNTRIES.map((c) => <option key={c[0]} value={c[1]}>{c[1]}</option>)}
    </select>
  );
}

function RefundPicker({ type, value, onChange }) {
  const opts = REFUND_OPTIONS[type] || REFUND_OPTIONS.physical;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {opts.map((k) => (
          <button key={k} type="button" onClick={() => onChange(k)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-full border ${value === k ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>
            {REFUND_POLICIES[k].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ivory/55">{REFUND_POLICIES[value]?.text} {STATUTORY_NOTE}</p>
    </div>
  );
}

function RightsPanel({ country, heading }) {
  const [open, setOpen] = useState(false);
  if (!country) return null;
  const sch = scheduleFor(country);
  return (
    <div className="rounded-2xl border border-ivory/10 bg-navy/40 text-xs text-ivory/75 mb-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
        <span className="font-medium text-ivory/90">{heading} ({sch.title})</span>
        <span className="text-gold">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p><b className="text-ivory/85">Consumer law:</b> {sch.consumer}</p>
          <ul className="list-disc ml-4 space-y-1">{sch.points.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><b className="text-ivory/85">Data protection:</b> {sch.data}</p>
          <p className="text-ivory/45">A plain-English summary, not legal advice.</p>
        </div>
      )}
    </div>
  );
}

function RefundBox({ policy }) {
  if (!policy || !REFUND_POLICIES[policy]) return null;
  return (
    <div className="rounded-2xl bg-navy/50 border border-ivory/10 px-4 py-3 text-sm mb-4">
      <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-gold/80 mb-1">Seller's refund policy</p>
      <p className="font-semibold text-ivory">{REFUND_POLICIES[policy].label}</p>
      <p className="text-xs text-ivory/65 mt-1">{REFUND_POLICIES[policy].text} {STATUTORY_NOTE}</p>
    </div>
  );
}

function ProductCard({ p, shopName, onOpen, onOpenShop }) {
  return (
    <Card className="overflow-hidden flex flex-col hover:border-gold/40 transition-colors">
      <button onClick={() => onOpen(p)} className="text-left flex-grow">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover" />
        ) : (
          <div className="w-full h-44 bg-navy/60 flex items-center justify-center text-ivory/20"><Package size={36} strokeWidth={1.2} /></div>
        )}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2 mb-2"><TypeBadge type={p.product_type} />
            {p.sales_count > 0 && <span className="text-[11px] text-gold flex items-center gap-1"><TrendingUp size={11} /> {p.sales_count} sold</span>}
          </div>
          <h3 className="font-semibold text-base text-ivory leading-snug mb-1">{p.name}</h3>
          <div className="mb-1"><StarRating value={p.avg_rating} count={p.review_count} /></div>
          <p className="text-sm font-semibold text-mint">{p.price_cents ? formatMoney(p.price_cents, p.currency) : p.price_text}</p>
        </div>
      </button>
      {shopName && (
        <button onClick={() => onOpenShop(p.shop_id)} className="px-4 pb-4 text-left text-xs text-ivory/55 hover:text-gold">
          by {shopName}
        </button>
      )}
    </Card>
  );
}

function BuyModal({ user, product, shop, onClose }) {
  const [f, setF] = useState({ buyer_name: '', buyer_email: user?.email || '', buyer_phone: '', delivery_address: '', buyer_notes: '', quantity: 1, buyer_country: '' });
  const [consent, setConsent] = useState(false);
  const [refundAck, setRefundAck] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const policy = product.refund_policy || shop?.refund_policy || 'days_14';
  const waiverNeeded = product.product_type === 'digital' && policy === 'no_refund' && needsDigitalWaiver(f.buyer_country);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legal, setLegal] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const physical = product.product_type === 'physical';
  const total = (product.price_cents || 0) * f.quantity;

  async function submit(e) {
    e.preventDefault();
    if (!f.buyer_name.trim() || !f.buyer_email.trim()) return setError('Please add your name and email.');
    if (physical && f.delivery_address.trim().length < 8) return setError('Please add a delivery address.');
    if (!f.buyer_country) return setError('Please choose the country you live in.');
    if (!refundAck) return setError("Please confirm you have read the seller's refund policy.");
    if (waiverNeeded && !waiver) return setError('Please give your consent to immediate delivery, or choose a different item.');
    if (!consent) return setError('Please tick the box to agree to share your details with the seller.');
    setBusy(true); setError('');
    const { data, error: err } = await supabase.functions.invoke('create-order-checkout', {
      body: { product_id: product.id, ...f, quantity: Number(f.quantity), consent: true, refund_ack: true, digital_waiver: waiver },
    });
    if (err) { setBusy(false); return setError(await fnErrorMessage(err)); }
    if (data?.url) window.location.href = data.url;
    else { setBusy(false); setError(data?.error || 'Could not start checkout.'); }
  }

  return (
    <FormModal title="Your order" onClose={onClose}>
      <div className="flex gap-3 mb-4 p-3 rounded-2xl bg-navy/50">
        {product.image_url && <img src={product.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />}
        <div>
          <p className="font-semibold text-ivory">{product.name}</p>
          <p className="text-xs text-ivory/55">Sold by {shop?.name}</p>
          <p className="text-sm font-semibold text-mint mt-0.5">{formatMoney(product.price_cents, product.currency)}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <FField label="Quantity">
          <input type="number" min={1} max={50} className={inputCls} value={f.quantity} onChange={(e) => set('quantity', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </FField>
        <FField label="Your name" required><input className={inputCls} value={f.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} /></FField>
        <FField label="Email" required><input type="email" className={inputCls} value={f.buyer_email} onChange={(e) => set('buyer_email', e.target.value)} /></FField>
        <FField label="Phone / WhatsApp"><input className={inputCls} value={f.buyer_phone} onChange={(e) => set('buyer_phone', e.target.value)} /></FField>
        <FField label="Country you live in" required><CountrySelect value={f.buyer_country} onChange={(v) => set('buyer_country', v)} /></FField>
        <RightsPanel country={f.buyer_country} heading="Your rights as a buyer" />
        {physical && (
          <FField label="Delivery address" required><textarea rows={3} className={inputCls} value={f.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} /></FField>
        )}
        <FField label="Note to the seller"><textarea rows={2} className={inputCls} value={f.buyer_notes} onChange={(e) => set('buyer_notes', e.target.value)} /></FField>
        {product.delivery_notes && <p className="text-xs text-ivory/60 mb-3"><b className="text-ivory/80">Delivery:</b> {product.delivery_notes}</p>}

        <RefundBox policy={policy} />
        <label className="flex items-start gap-2.5 text-xs text-ivory/80 mb-3 cursor-pointer">
          <input type="checkbox" checked={refundAck} onChange={(e) => setRefundAck(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
          <span>I have read the seller's refund policy above.</span>
        </label>
        {waiverNeeded && (
          <label className="flex items-start gap-2.5 text-xs text-ivory/80 mb-3 cursor-pointer">
            <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
            <span>I expressly ask for this digital item to be supplied straight away, and I understand that once it starts I lose my right to cancel.</span>
          </label>
        )}

        <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3 text-xs text-ivory/80 mb-3">
          <p className="font-semibold text-gold mb-1">How your details are shared</p>
          <p>
            To deliver your order, we send your name, email{f.buyer_phone ? ', phone' : ''}{physical ? ' and delivery address' : ''} to {shop?.name}. They may only use them to fulfil and support this order, not for marketing, and must not pass them on. Payment is taken securely by Stripe and the seller never sees your card details.
          </p>
        </div>
        <label className="flex items-start gap-2.5 text-xs text-ivory/80 mb-4 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
          <span>I agree that The Boardroom JA shares my details with {shop?.name} so they can deliver my order. See our{' '}
            <button type="button" onClick={() => setLegal('privacy')} className="text-gold underline underline-offset-2">Privacy Policy</button> and{' '}
            <button type="button" onClick={() => setLegal('terms')} className="text-gold underline underline-offset-2">Terms</button>.
          </span>
        </label>
        {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
        <GoldButton type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : `Pay ${formatMoney(total, product.currency)}`}
        </GoldButton>
        <p className="text-[11px] text-ivory/45 mt-3">Refunds and returns are handled by the seller under the policy above. Contact us if you need help.</p>
      </form>
      {legal === 'privacy' && <LegalModal title="Privacy Policy" text={PRIVACY_POLICY_TEXT} onClose={() => setLegal(null)} />}
      {legal === 'terms' && <LegalModal title="Terms of Use" text={TERMS_OF_USE_TEXT} onClose={() => setLegal(null)} />}
    </FormModal>
  );
}

function ProductModal({ product, shop, user, onRequireAuth, onClose, onBuy, onOpenShop }) {
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    supabase.from('reviews').select('id,reviewer_name,rating,comment,created_at')
      .eq('product_id', product.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setReviews(data || []));
  }, [product.id]);
  return (
    <FormModal title={product.name} onClose={onClose}>
      {product.image_url && <img src={product.image_url} alt={product.name} className="w-full max-h-72 object-cover rounded-2xl mb-4" />}
      <div className="flex items-center gap-2 mb-3"><TypeBadge type={product.product_type} />
        {product.category && <span className="text-[11px] text-ivory/55">{product.category}</span>}
        {product.sales_count > 0 && <span className="text-[11px] text-gold">{product.sales_count} sold</span>}
      </div>
      <p className="text-xl font-semibold text-mint mb-2">{formatMoney(product.price_cents, product.currency)}</p>
      <div className="mb-3"><StarRating value={product.avg_rating} count={product.review_count} size={15} /></div>
      {product.description && <p className="text-sm text-ivory/80 whitespace-pre-line mb-4">{product.description}</p>}
      {product.delivery_notes && <p className="text-sm text-ivory/70 mb-4"><b className="text-ivory/85">Delivery:</b> {product.delivery_notes}</p>}
      <RefundBox policy={product.refund_policy || shop?.refund_policy || 'days_14'} />
      {shop && <button onClick={() => onOpenShop(shop.id)} className="text-sm text-gold underline underline-offset-2 mb-5 block">Visit {shop.name}</button>}
      {reviews.length > 0 && (
        <div className="mb-5">
          <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Verified buyer reviews</h4>
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl bg-navy/50 px-4 py-3 text-sm">
                <p className="flex items-center gap-2"><span className="text-ivory">{r.reviewer_name}</span><StarRating value={r.rating} count={1} size={12} showCount={false} /><span className="ml-auto"><ReportLink user={user} onRequireAuth={onRequireAuth} type="review" id={r.id} /></span></p>
                {r.comment && <p className="text-ivory/70 mt-1 whitespace-pre-line">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {product.stock_status === 'out_of_stock' ? (
        <p className="text-sm text-rose">Out of stock</p>
      ) : (
        <GoldButton onClick={onBuy}>Buy now</GoldButton>
      )}
      <div className="mt-4"><ReportLink user={user} onRequireAuth={onRequireAuth} type="product" id={product.id} label="Report this listing" /></div>
    </FormModal>
  );
}


function PayoutNotice({ country }) {
  if (!country) return null;
  if (payoutRoute(country) === 'connect') {
    return (
      <div className="rounded-2xl bg-emerald/15 border border-emerald/40 p-4 text-sm text-ivory/85">
        <p className="font-semibold text-ivory mb-1">Automatic payouts through Stripe</p>
        <p>Your bank country is supported, so you will be paid automatically once your balance reaches {MIN_PAYOUT} (in the currency of your sales) after the 30 day payment period. You will finish a short Stripe set-up for your identity and bank details. We never see or store them.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-wine/40 border border-wine p-4 text-sm text-ivory/85">
      <p className="font-semibold text-ivory mb-1">Manual payouts for {country}</p>
      <p>Stripe does not accept bank accounts in {country} yet, so we pay you by manual bank transfer instead of automatically. Payouts are made once your balance reaches {MIN_PAYOUT} (US$100, or the same amount in the currency of your sales), after the 30 day payment period. We will email you to collect the details we need. Bank and currency conversion charges are deducted. When Stripe supports your country we will move you to automatic payouts.</p>
    </div>
  );
}

function OpenShopForm({ user, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', description: '', country: '', order_email: user.email || '', logo_url: '', refund_policy: 'days_14', payout_country: '' });
  const [payAck, setPayAck] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.order_email.trim() || !f.country.trim()) return setError('Please add a shop name, country and order email.');
    if (!f.payout_country) return setError('Please choose the country where your bank account is.');
    if (payoutRoute(f.payout_country) === 'manual' && !payAck) return setError('Please confirm you understand payouts to your country are manual.');
    if (!agreed) return setError('Please agree to the Seller and Organizer Terms.');
    setSaving(true); setError('');
    const slug = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error: err } = await supabase.from('shops').insert({
      owner_id: user.id, name: f.name.trim(), slug, description: f.description.trim() || null,
      country: f.country, order_email: f.order_email.trim(), logo_url: f.logo_url.trim() || null, refund_policy: f.refund_policy,
      payout_country: f.payout_country, payout_notice_ack_at: payoutRoute(f.payout_country) === 'manual' ? new Date().toISOString() : null,
      seller_terms_accepted_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) return setError(err.message);
    onSaved();
  }

  return (
    <FormModal title="Open your shop" onClose={onClose}>
      <div className="mb-4"><FeeNotice onReadTerms={() => setShowTerms(true)} /></div>
      <form onSubmit={submit}>
        <FField label="Shop name" required><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></FField>
        <FField label="About your shop"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Country you sell from" required><CountrySelect value={f.country} onChange={(v) => set('country', v)} /></FField>
        <RightsPanel country={f.country} heading="Laws that apply to you as a seller" />
        <FField label="Your default refund policy"><RefundPicker type="physical" value={f.refund_policy} onChange={(v) => set('refund_policy', v)} /></FField>
        <FField label="Email for order notifications" required><input type="email" className={inputCls} value={f.order_email} onChange={(e) => set('order_email', e.target.value)} /></FField>
        <FField label="Logo link"><input className={inputCls} value={f.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://" /></FField>
        <FField label="Country where your bank account is" required><CountrySelect value={f.payout_country} onChange={(v) => { set('payout_country', v); setPayAck(false); }} /></FField>
        {f.payout_country && <div className="mb-4"><PayoutNotice country={f.payout_country} /></div>}
        {f.payout_country && payoutRoute(f.payout_country) === 'manual' && (
          <label className="flex items-start gap-2 text-sm text-ivory/80 mb-4">
            <input type="checkbox" checked={payAck} onChange={(e) => setPayAck(e.target.checked)} className="mt-1 accent-[#D4A33A]" />
            <span>I understand payouts to my country are manual, and made once my balance reaches {MIN_PAYOUT}.</span>
          </label>
        )}
        <SellerAgree checked={agreed} onChange={setAgreed} onReadTerms={() => setShowTerms(true)} />
        {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
        <p className="text-xs text-ivory/50 mb-4">We review every shop before it goes live. When an order comes in we email you the buyer's details so you can arrange delivery.</p>
        <GoldButton type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Submit shop for review'}</GoldButton>
      </form>
      {showTerms && <LegalModal title="Seller and Organizer Terms" text={SELLER_TERMS_TEXT} onClose={() => setShowTerms(false)} />}
    </FormModal>
  );
}

function ProductForm({ user, shop, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', description: '', category: SHOP_CATEGORIES[0].name, product_type: 'physical', price: '', currency: 'USD', image_url: '', delivery_notes: '', stock_status: 'in_stock', refund_policy: shop.refund_policy || 'days_14' });
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    const price = Math.round(parseFloat(f.price) * 100);
    if (!f.name.trim() || !(price > 0)) return setError('Please add a name and a price.');
    if (!agreed) return setError('Please agree to the Seller and Organizer Terms.');
    setSaving(true); setError('');
    const { error: err } = await supabase.from('products').insert({
      shop_id: shop.id, seller_id: user.id, name: f.name.trim(), description: f.description.trim() || null,
      category: f.category, product_type: f.product_type, price_cents: price, currency: f.currency,
      refund_policy: policyValue, price_text: formatMoney(price, f.currency), image_url: f.image_url.trim() || null,
      delivery_notes: f.delivery_notes.trim() || null, stock_status: f.stock_status,
      review_status: 'pending', is_active: false, seller_terms_accepted_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) return setError(err.message);
    onSaved();
  }

  const policyValue = (REFUND_OPTIONS[f.product_type] || []).includes(f.refund_policy) ? f.refund_policy : REFUND_OPTIONS[f.product_type][0];
  const pill = (k, v, l) => (
    <button key={v} type="button" onClick={() => set(k, v)}
      className={`px-4 py-2 text-sm font-medium rounded-full border ${f[k] === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
  );

  return (
    <FormModal title="Add a product" onClose={onClose}>
      <form onSubmit={submit}>
        <FField label="Name" required><input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Type"><div className="flex gap-2">{pill('product_type', 'physical', 'Physical')}{pill('product_type', 'digital', 'Digital')}</div></FField>
        <FField label="Category">
          <select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value)}>
            {SHOP_CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </FField>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><FField label="Price" required><input inputMode="decimal" className={inputCls} value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="25.00" /></FField></div>
          <FField label="Currency"><select className={inputCls} value={f.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></FField>
        </div>
        <FField label="Image link"><input className={inputCls} value={f.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://" /></FField>
        <FField label={f.product_type === 'digital' ? 'How you will deliver it' : 'Delivery or collection details'}>
          <input className={inputCls} value={f.delivery_notes} onChange={(e) => set('delivery_notes', e.target.value)} placeholder={f.product_type === 'digital' ? 'e.g. Emailed within 24 hours' : 'e.g. Courier within Kingston, 3 to 5 days'} />
        </FField>
        <FField label="Refund policy for this product"><RefundPicker type={f.product_type} value={policyValue} onChange={(v) => set('refund_policy', v)} /></FField>
        <SellerAgree checked={agreed} onChange={setAgreed} onReadTerms={() => setShowTerms(true)} />
        {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
        <p className="text-xs text-ivory/50 mb-4">Products are reviewed before they appear in the shop. Buyers see your refund policy before they pay.</p>
        <GoldButton type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Submit for review'}</GoldButton>
      </form>
      {showTerms && <LegalModal title="Seller and Organizer Terms" text={SELLER_TERMS_TEXT} onClose={() => setShowTerms(false)} />}
    </FormModal>
  );
}

function MyShopPanel({ user, onClose, onChanged, isPaid, onUpgrade, isApproved, status, onApply }) {
  const [shop, setShop] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [myReviews, setMyReviews] = useState({});
  const [balances, setBalances] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [form, setForm] = useState(null); // 'shop' | 'product'

  const load = useCallback(async () => {
    const { data: shopRows } = await supabase.rpc('my_shop');
    const s = Array.isArray(shopRows) ? shopRows[0] : shopRows;
    setShop(s || null);
    if (s) {
      const { data: p } = await supabase.from('products').select('*').eq('shop_id', s.id).order('created_at', { ascending: false });
      setProducts(p || []);
      const { data: o } = await supabase.from('orders').select('*').eq('seller_id', user.id).neq('status', 'pending_payment').order('created_at', { ascending: false });
      setOrders(o || []);
      const { data: bal } = await supabase.rpc('my_payout_balance');
      setBalances(bal || []);
      const { data: po } = await supabase.from('payouts').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }).limit(10);
      setPayouts(po || []);
      if (s.payout_method === 'stripe_connect' && s.stripe_account_id && s.connect_status !== 'active') {
        const { data: st } = await supabase.functions.invoke('connect-onboard', { body: { action: 'status' } });
        if (st?.status === 'active') setShop({ ...s, connect_status: 'active' });
      }
    }
    const { data: b } = await supabase.from('orders').select('*').eq('buyer_id', user.id).neq('status', 'pending_payment').order('created_at', { ascending: false });
    setPurchases(b || []);
    const { data: rv } = await supabase.from('reviews').select('order_id,rating').eq('reviewer_id', user.id);
    setMyReviews(Object.fromEntries((rv || []).map((r) => [r.order_id, r])));
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  async function startPayoutSetup() {
    setPayBusy(true); setPayErr('');
    const { data, error } = await supabase.functions.invoke('connect-onboard', { body: { action: 'start' } });
    setPayBusy(false);
    if (error || !data?.url) { setPayErr(data?.error || 'Could not start payout set-up. Please try again later.'); return; }
    window.location.href = data.url;
  }

  async function setStatus(p, stock, live) {
    const { error } = await supabase.rpc('set_product_status', { p_product_id: p.id, p_stock: stock || 'in_stock', p_live: live });
    if (error) alert(error.message);
    load();
  }

  async function fulfil(id) {
    await supabase.rpc('mark_order_fulfilled', { p_order_id: id });
    load();
  }

  const statusLabel = (p) => (p.review_status === 'approved' && p.is_active ? (p.stock_status === 'out_of_stock' ? 'Sold out' : 'Live') : p.review_status === 'approved' ? 'Paused' : p.review_status === 'rejected' ? 'Declined' : 'In review');

  return (
    <FormModal title="My shop and orders" onClose={onClose}>
      {shop === undefined ? <Spinner /> : (
        <div className="space-y-6">
          {!shop ? (
            !isApproved ? (
              <div>
                <p className="text-sm text-ivory/75 mb-3">
                  {status === 'pending' ? 'Your application is being reviewed. You can open a shop once you are approved and have started your membership.'
                    : status === 'declined' ? `Selling is not available because your application was not approved. Questions? Email ${CONTACT_EMAIL}.`
                    : 'Selling in the Shop is for members of the network, which is for women in business. You can still buy from any shop.'}
                </p>
                {status === 'unconfirmed' && <GoldButton onClick={() => { onClose(); onApply(); }}>Apply to join</GoldButton>}
              </div>
            ) : isPaid ? (
              <div>
                <p className="text-sm text-ivory/75 mb-3">Open your own shop and sell physical and digital products to the community. Listing is free for members.</p>
                <GoldButton onClick={() => setForm('shop')}>Open your shop</GoldButton>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ivory/75 mb-3">Selling in the Shop is for members. Start your 14 day free trial to open a shop and list your products.</p>
                <GoldButton onClick={onUpgrade}>Start free trial</GoldButton>
                <p className="text-[11px] text-ivory/45 mt-2">{SOFT_GOLD_NOTE}</p>
              </div>
            )
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="font-semibold text-ivory text-lg">{shop.name}</h3>
                <span className="text-[11px] font-medium rounded-full px-2.5 py-1 bg-ivory/[0.07] text-ivory/70">
                  {shop.review_status === 'approved' ? 'Live' : shop.review_status === 'rejected' ? 'Declined' : 'In review'}
                </span>
              </div>
              {shop.review_status !== 'approved' && <p className="text-xs text-ivory/55 mb-3">We're reviewing your shop. You can add products now and they'll appear once it's approved.</p>}
              {isApproved && <div className="mb-4"><GoldButton onClick={() => setForm('product')}><Plus size={15} /> Add a product</GoldButton></div>}
              {products.length > 0 && (
                <div className="space-y-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-navy/50 px-4 py-3 text-sm">
                      <div><p className="text-ivory">{p.name}</p><p className="text-xs text-ivory/50">{formatMoney(p.price_cents, p.currency)} · {p.sales_count} sold</p></div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[11px] text-ivory/60">{statusLabel(p)}</span>
                        {p.review_status === 'approved' && (
                          <div className="flex gap-3">
                            <button onClick={() => setStatus(p, p.stock_status === 'out_of_stock' ? 'in_stock' : 'out_of_stock', p.is_active)} className="text-[11px] text-gold underline underline-offset-2">{p.stock_status === 'out_of_stock' ? 'Mark in stock' : 'Mark sold out'}</button>
                            <button onClick={() => setStatus(p, p.stock_status, !p.is_active)} className="text-[11px] text-gold underline underline-offset-2">{p.is_active ? 'Pause' : 'Resume'}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


          {shop && shop.payout_country && (
            <div>
              <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Payouts</h4>
              <PayoutNotice country={shop.payout_country} />
              {shop.payout_method === 'stripe_connect' && (
                <div className="mt-3">
                  {shop.connect_status === 'active' ? (
                    <p className="text-sm text-mint flex items-center gap-1"><Check size={14} /> Stripe payouts are set up.</p>
                  ) : (
                    <>
                      <GoldButton onClick={startPayoutSetup} disabled={payBusy}>{payBusy ? <Loader2 className="animate-spin" size={16} /> : shop.connect_status === 'pending' ? 'Finish Stripe set-up' : 'Set up payouts with Stripe'}</GoldButton>
                      {payErr && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mt-2">{payErr}</p>}
                    </>
                  )}
                </div>
              )}
              <div className="mt-3 space-y-1">
                {balances.length === 0 ? <p className="text-sm text-ivory/50">No earnings waiting to be paid yet.</p> : balances.map((b) => (
                  <p key={b.currency} className="text-sm text-ivory/80">
                    {b.currency}: <b className="text-ivory">{formatMoney(Number(b.available_cents), b.currency)}</b> ready
                    {Number(b.pending_cents) > 0 ? ` · ${formatMoney(Number(b.pending_cents), b.currency)} still in the 30 day period` : ''}
                    {Number(b.available_cents) < b.minimum_cents ? ` · paid out once ready balance reaches ${formatMoney(b.minimum_cents, b.currency)}` : ''}
                  </p>
                ))}
              </div>
              {payouts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {payouts.map((p) => (
                    <p key={p.id} className="text-xs text-ivory/60">{new Date(p.created_at).toLocaleDateString()} · {formatMoney(p.amount_cents, p.currency)} · {p.status === 'paid' ? 'Paid' : p.status === 'failed' ? 'Failed, we will retry' : 'Being prepared'}{p.manual_reference ? ` · ref ${p.manual_reference}` : ''}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {shop && (
            <div>
              <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Orders to fulfil</h4>
              {orders.length === 0 ? <p className="text-sm text-ivory/50">No orders yet.</p> : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div key={o.id} className="rounded-2xl bg-navy/50 p-4 text-sm">
                      <div className="flex justify-between gap-3 mb-2">
                        <p className="font-semibold text-ivory">#{o.order_number} · {o.product_name} × {o.quantity}</p>
                        <span className="text-[11px] text-ivory/60">{o.status === 'fulfilled' ? 'Fulfilled' : o.status === 'paid' ? 'Paid' : o.status}</span>
                      </div>
                      <p className="text-ivory/80">{o.buyer_name} · {o.buyer_email}{o.buyer_phone ? ` · ${o.buyer_phone}` : ''}</p>
                      {o.delivery_address && <p className="text-ivory/70 whitespace-pre-line mt-1">{o.delivery_address}</p>}
                      {o.buyer_notes && <p className="text-ivory/60 mt-1">Note: {o.buyer_notes}</p>}
                      <p className="text-xs text-ivory/50 mt-2">
                        Sale {formatMoney(o.amount_cents, o.currency)} · Stripe fees {formatMoney(o.stripe_fee_cents, o.currency)} · Commission {formatMoney(o.commission_cents, o.currency)} · You receive {formatMoney(o.seller_payout_cents, o.currency)}
                        {o.payout_due_date ? ` · payout due by ${o.payout_due_date}` : ''}
                      </p>
                      <p className="text-[11px] text-ivory/40 mt-1">Use these details only to fulfil this order. Do not use them for marketing or share them.</p>
                      {o.status === 'paid' && <div className="mt-3"><GoldButton onClick={() => fulfil(o.id)}><Check size={14} /> Mark as fulfilled</GoldButton></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Your purchases</h4>
            {purchases.length === 0 ? <p className="text-sm text-ivory/50">Nothing yet.</p> : (
              <div className="space-y-2">
                {purchases.map((o) => (
                  <div key={o.id} className="flex justify-between gap-3 rounded-xl bg-navy/50 px-4 py-3 text-sm">
                    <div className="flex-grow"><p className="text-ivory">#{o.order_number} · {o.product_name}</p><p className="text-xs text-ivory/50">{formatMoney(o.amount_cents, o.currency)}</p>
                      {['paid', 'fulfilled'].includes(o.status) && <RateOrder order={o} existing={myReviews[o.id]} onDone={load} />}
                    </div>
                    <span className="text-[11px] text-ivory/60">{o.status === 'fulfilled' ? 'Delivered' : 'Paid'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {form === 'shop' && <OpenShopForm user={user} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); onChanged(); }} />}
      {form === 'product' && shop && <ProductForm user={user} shop={shop} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </FormModal>
  );
}

function ShopTab({ user, onRequireAuth, openPanel, isPaid, onUpgrade, isApproved, status, onApply }) {
  const [products, setProducts] = useState(null);
  const [shops, setShops] = useState([]);
  const [view, setView] = useState({ mode: 'home' }); // home | category | shop
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState(null);
  const [buying, setBuying] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [dirByOwner, setDirByOwner] = useState({});
  useEffect(() => { if (openPanel && user) setShowPanel(true); }, [openPanel, user]);

  const load = useCallback(async () => {
    const { data: p } = await supabase.from('products').select('*')
      .eq('is_active', true).eq('review_status', 'approved').not('shop_id', 'is', null)
      .order('sales_count', { ascending: false }).order('created_at', { ascending: false });
    const { data: s } = await supabase.from('shops').select('id, owner_id, name, slug, description, logo_url, country, refund_policy, is_active, review_status, created_at').eq('is_active', true).eq('review_status', 'approved');
    const { data: rt } = await supabase.from('product_ratings').select('*');
    const rmap = Object.fromEntries((rt || []).map((r) => [r.product_id, r]));
    setProducts((p || []).filter((x) => !IS_NATIVE_APP || x.product_type === 'physical').map((x) => ({ ...x, avg_rating: rmap[x.id]?.avg_rating, review_count: rmap[x.id]?.review_count || 0 })));
    setShops(s || []);
    const owners = (s || []).map((x) => x.owner_id);
    if (owners.length) {
      const { data: d } = await supabase.from('business_directory').select('user_id, business_name, category, description, parish, website_url, logo_url').in('user_id', owners).eq('is_active', true);
      setDirByOwner(Object.fromEntries((d || []).map((x) => [x.user_id, x])));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (products === null) return <Spinner />;

  const shopById = Object.fromEntries(shops.map((s) => [s.id, s]));
  const visible = products.filter((p) => shopById[p.shop_id]);
  const q = query.trim().toLowerCase();
  const matches = (p) =>
    (type === 'all' || p.product_type === type) &&
    (!q || `${p.name} ${p.description || ''} ${p.category || ''} ${shopById[p.shop_id]?.name || ''}`.toLowerCase().includes(q));
  const bySold = (a, b) => (b.sales_count - a.sales_count) || (new Date(b.created_at) - new Date(a.created_at));

  let list = null;
  let heading = null;
  if (view.mode === 'category') {
    list = visible.filter((p) => p.category === view.cat && matches(p)).sort(bySold);
    heading = view.cat;
  } else if (view.mode === 'shop') {
    list = visible.filter((p) => p.shop_id === view.shopId && matches(p)).sort(bySold);
    heading = shopById[view.shopId]?.name;
  } else if (q || type !== 'all') {
    list = visible.filter(matches).sort(bySold);
    heading = q ? `Results for "${query.trim()}"` : type === 'digital' ? 'Digital products' : 'Physical products';
  }

  const openShop = (id) => { setSelected(null); setQuery(''); setView({ mode: 'shop', shopId: id }); window.scrollTo({ top: 0 }); };
  const catCount = (name) => visible.filter((p) => p.category === name).length;
  const bestSellers = [...visible].filter((p) => p.sales_count > 0).sort(bySold).slice(0, 6);
  const shop = view.mode === 'shop' ? shopById[view.shopId] : null;

  const grid = (items) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => <ProductCard key={p.id} p={p} shopName={shopById[p.shop_id]?.name} onOpen={setSelected} onOpenShop={openShop} />)}
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-grow">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ivory/40" />
          <input className={`${inputCls} pl-11`} placeholder="Search products, shops and categories" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <GoldButton onClick={() => (user ? setShowPanel(true) : onRequireAuth())}><Store size={15} /> {user ? (isApproved ? 'My shop and orders' : 'My orders') : 'Sell on The Boardroom'}</GoldButton>
      </div>

      <div className="flex gap-2 mb-6">
        {[['all', 'All'], ['physical', 'Physical'], ['digital', 'Digital']].map(([v, l]) => (
          <button key={v} onClick={() => setType(v)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full border ${type === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
        ))}
      </div>

      {(view.mode !== 'home') && (
        <button onClick={() => { setView({ mode: 'home' }); setQuery(''); }} className="flex items-center gap-1.5 text-sm text-ivory/70 hover:text-gold mb-4">
          <ArrowLeft size={15} /> All categories
        </button>
      )}

      {shop && (() => {
        const dir = dirByOwner[shop.owner_id];
        const logo = shop.logo_url || dir?.logo_url;
        const about = shop.description || dir?.description;
        return (
          <Card className="p-5 mb-6 flex gap-4 items-start">
            {logo ? <img src={logo} alt="" className="w-16 h-16 rounded-2xl object-cover" /> : <div className="w-16 h-16 rounded-2xl bg-navy/60 flex items-center justify-center text-gold"><Store size={26} /></div>}
            <div>
              <h2 className="font-display text-xl text-ivory">{shop.name}</h2>
              {dir && <p className="text-xs text-gold mb-1">Part of {dir.business_name} in the member Directory{dir.category ? ` · ${dir.category}` : ''}</p>}
              {(dir?.parish || shop.country) && <p className="text-xs text-ivory/50 mb-1 flex items-center gap-1"><MapPin size={11} /> {[dir?.parish, shop.country].filter(Boolean).join(', ')}</p>}
              {about && <p className="text-sm text-ivory/75 mb-1">{about}</p>}
              {dir?.website_url && /^https?:\/\//i.test(dir.website_url) && <a href={dir.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline inline-flex items-center gap-1">Website <ExternalLink size={11} /></a>}
            </div>
          </Card>
        );
      })()}

      {list ? (
        <div>
          {view.mode !== 'shop' && <h2 className="font-display text-xl text-ivory mb-1">{heading}</h2>}
          <p className="text-xs text-ivory/45 mb-4">Most sold first</p>
          {list.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="Nothing found" body="Try another search or category." />
          ) : grid(list)}
        </div>
      ) : (
        <div className="space-y-10">
          <div>
            <h2 className="font-display text-xl text-ivory mb-3">Browse categories</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {SHOP_CATEGORIES.map(({ name, icon: Icon }) => (
                <button key={name} onClick={() => setView({ mode: 'category', cat: name })}
                  className="text-left rounded-2xl bg-surface border border-ivory/[0.07] p-4 hover:border-gold/40 transition-colors">
                  <Icon size={22} className="text-gold mb-3" strokeWidth={1.6} />
                  <p className="text-sm font-semibold text-ivory leading-snug">{name}</p>
                  <p className="text-xs text-ivory/45 mt-0.5">{catCount(name)} {catCount(name) === 1 ? 'item' : 'items'}</p>
                </button>
              ))}
            </div>
          </div>

          {bestSellers.length > 0 && (
            <div>
              <h2 className="font-display text-xl text-ivory mb-3">Best sellers</h2>
              {grid(bestSellers)}
            </div>
          )}

          {shops.length > 0 && (
            <div>
              <h2 className="font-display text-xl text-ivory mb-3">Shops</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shops.map((s) => (
                  <button key={s.id} onClick={() => openShop(s.id)} className="text-left rounded-2xl bg-surface border border-ivory/[0.07] p-4 flex items-center gap-3 hover:border-gold/40 transition-colors">
                    {s.logo_url ? <img src={s.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" /> : <div className="w-12 h-12 rounded-xl bg-navy/60 flex items-center justify-center text-gold"><Store size={20} /></div>}
                    <div><p className="font-semibold text-ivory text-sm">{s.name}</p><p className="text-xs text-ivory/50">{visible.filter((p) => p.shop_id === s.id).length} items</p></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {visible.length === 0 && (
            <EmptyState icon={ShoppingBag} title="Be the first to open a shop" body="Sell physical and digital products to the community. It's free to list." />
          )}
        </div>
      )}

      {selected && !buying && (
        <ProductModal product={selected} shop={shopById[selected.shop_id]} user={user} onRequireAuth={onRequireAuth} onClose={() => setSelected(null)}
          onBuy={() => (user ? setBuying(selected) : onRequireAuth())} onOpenShop={openShop} />
      )}
      {buying && <BuyModal user={user} product={buying} shop={shopById[buying.shop_id]} onClose={() => { setBuying(null); setSelected(null); }} />}
      {showPanel && user && <MyShopPanel user={user} isPaid={isPaid} onUpgrade={onUpgrade} isApproved={isApproved} status={status} onApply={onApply} onClose={() => setShowPanel(false)} onChanged={load} />}
    </div>
  );
}

/* ---------------------------------------------------------
   Resources tab — FREE ONLY for beta
--------------------------------------------------------- */

const RESOURCE_CATEGORIES = ['Templates', 'Guides', 'Checklists', 'Legal and compliance', 'Marketing', 'Finance', 'Other'];
const RESOURCE_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

function ResourceUploadForm({ user, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', description: '', category: RESOURCE_CATEGORIES[0], uploader: '' });
  const [file, setFile] = useState(null);
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!f.title.trim() || !file) return setError('Please add a title and choose a file.');
    const ext = RESOURCE_TYPES[file.type];
    if (!ext) return setError('Please upload a PDF, Word, Excel, PowerPoint, PNG or JPG file.');
    if (file.size > 20 * 1024 * 1024) return setError('The file must be under 20 MB.');
    if (!rights) return setError('Please confirm you have the right to share this file.');
    setSaving(true); setError('');
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('member-resources').upload(path, file, { contentType: file.type });
    if (upErr) { setSaving(false); return setError(upErr.message); }
    const { data: pub } = supabase.storage.from('member-resources').getPublicUrl(path);
    const { error: err } = await supabase.from('resources').insert({
      title: f.title.trim(), description: f.description.trim() || null, category: f.category,
      resource_type: 'free', file_url: pub.publicUrl, uploaded_by: user.id, uploaded_by_name: f.uploader.trim() || null,
      review_status: 'pending', is_active: false, rights_confirmed_at: new Date().toISOString(),
    });
    setSaving(false);
    if (err) return setError(err.message);
    onSaved();
  }

  return (
    <FormModal title="Share a free resource" onClose={onClose}>
      <p className="text-sm text-ivory/70 mb-4">Share a template, guide or checklist with other members. It's free for everyone to download, and we review it before it goes live.</p>
      <form onSubmit={submit}>
        <FField label="Title" required><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Category"><select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value)}>{RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></FField>
        <FField label="Shared by (name or business)"><input className={inputCls} value={f.uploader} onChange={(e) => set('uploader', e.target.value)} /></FField>
        <FField label="File (PDF, Word, Excel, PowerPoint, PNG or JPG, up to 20 MB)" required>
          <input type="file" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm text-ivory/80" />
        </FField>
        <label className="flex items-start gap-2.5 text-xs text-ivory/75 mb-4 cursor-pointer">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
          <span>I created this or have the right to share it, it contains no one's personal information, and I'm happy for members to download and use it for free.</span>
        </label>
        {error && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{error}</p>}
        <GoldButton type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : 'Submit for review'}</GoldButton>
      </form>
    </FormModal>
  );
}

function ResourcesTab({ user, onRequireAuth, isApproved, status, onApply }) {
  const [resources, setResources] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase
      .from('resources')
      .select('*')
      .eq('is_active', true)
      .eq('review_status', 'approved')
      .eq('resource_type', 'free')
      .order('created_at', { ascending: false })
      .then(({ data }) => setResources(data || []));
  }, []);

  if (resources === null) return <Spinner />;

  const bar = (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-sm text-ivory/60">Free templates, guides and checklists from the community.</p>
      <GoldButton onClick={() => (!user ? onRequireAuth() : isApproved ? setShowForm(true) : status === 'unconfirmed' ? onApply() : null)}><Plus size={15} /> {!user || isApproved ? 'Share a free resource' : status === 'pending' ? 'Application pending' : status === 'declined' ? 'Not available' : 'Apply to join to share'}</GoldButton>
    </div>
  );
  const modal = showForm && <ResourceUploadForm user={user} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setSubmitted(true); }} />;

  return (
    <div>
      {submitted && <SubmittedNote onDismiss={() => setSubmitted(false)} />}
      {bar}
      {modal}
      {resources.length === 0 ? (
        <EmptyState icon={FileText} title="Resources loading" body="Free member resources will appear here shortly. Share the first one." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {resources.map((r) => (
            <Card key={r.id} className="p-5 flex flex-col">
              <SectionLabel>{r.category || 'Resource'}</SectionLabel>
              <h3 className="font-semibold text-lg tracking-tight text-ivory mb-1">{r.title}</h3>
              {r.uploaded_by_name && <p className="text-xs text-ivory/50 mb-2">Shared by {r.uploaded_by_name}</p>}
              {r.description && <p className="text-sm text-ivory/75 mb-4 flex-grow">{r.description}</p>}
              {r.file_url && (
                <GoldButton href={r.file_url} download={r.file_url.split('/').pop()}>
                  <Download size={14} /> Download
                </GoldButton>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OnboardingFlow({ user, status, hasBeta, betaDays, onApplied, onDone }) {
  const [step, setStep] = useState(null); // eligibility | details | submitted | declined | trial
  const [st, setSt] = useState(status);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Decide where to start once, when the flow opens.
  useEffect(() => {
    let live = true;
    supabase.from('business_private').select('user_id').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (!live) return;
      if (status === 'unconfirmed') setStep('eligibility');
      else if (status === 'declined') setStep('declined');
      else if (!data) setStep('details');
      else if (status === 'approved') setStep(hasBeta ? 'beta' : 'trial');
      else setStep('submitted');
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function apply() {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('apply_for_membership');
    setBusy(false);
    if (error) return setErr('Could not send your application. Please try again.');
    setSt(data || 'pending');
    if (onApplied) onApplied();
    setStep('details');
  }

  async function startTrial() {
    setBusy(true); setErr('');
    const e = await startMembershipCheckout();
    if (e) { setErr(e); setBusy(false); }
  }

  if (step === null) return <FormModal title="One moment" onClose={onDone}><Spinner /></FormModal>;

  if (step === 'eligibility') {
    return (
      <FormModal title="Welcome to The Boardroom JA" onClose={onDone}>
        <p className="text-sm text-ivory/85 mb-3">The Boardroom JA is a network for women in business. It is open to women, including trans women.</p>
        <ul className="text-sm text-ivory/80 space-y-1.5 mb-4 list-disc pl-5">
          <li>Everyone can browse the Directory and buy from the Shop.</li>
          <li>Members can message each other, use Skillswap, list their business, share resources and, with a paid membership, open a shop.</li>
        </ul>
        <label className="flex items-start gap-2.5 text-sm text-ivory/85 mb-4 cursor-pointer">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
          <span>I confirm that I am a woman and that what I tell you is true. I understand that every application is reviewed and that my access can be removed if I do not meet this rule.</span>
        </label>
        <GoldButton onClick={apply} disabled={!agree || busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Apply to join'}</GoldButton>
        {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mt-3">{err}</p>}
        <button onClick={onDone} className="block mt-4 text-sm text-ivory/60 hover:text-ivory underline underline-offset-2">I am just here to browse and buy</button>
      </FormModal>
    );
  }

  if (step === 'details') {
    return <ListBusinessForm user={user} existing={null} onboarding pendingReview={st !== 'approved'} onClose={onDone} onSaved={() => setStep(st === 'approved' ? (hasBeta ? 'beta' : 'trial') : 'submitted')} />;
  }

  if (step === 'submitted') {
    return (
      <FormModal title="Application received" onClose={onDone}>
        <p className="text-sm text-ivory/85 mb-3">Thank you. We review every application personally. Once you are approved you can message members, use Skillswap, appear in the Directory, share resources and start your 14 day free trial to open a shop.</p>
        <p className="text-xs text-ivory/60 mb-4">Until then you can browse the Directory and buy from the Shop. Open the app again to see your status.</p>
        <GoldButton onClick={onDone}>Close</GoldButton>
      </FormModal>
    );
  }

  if (step === 'beta') {
    return (
      <FormModal title="You are in. Welcome, beta tester" onClose={onDone}>
        <p className="text-sm text-ivory/85 mb-3">Your 14 day beta trial of full membership is running{betaDays > 0 ? `, with ${betaDays} ${betaDays === 1 ? 'day' : 'days'} left` : ''}. No card has been taken.</p>
        <ul className="text-sm text-ivory/80 space-y-1.5 mb-4 list-disc pl-5">
          <li>Other members can message you from the Directory</li>
          <li>You can open a shop and list your products</li>
        </ul>
        <p className="text-xs text-ivory/60 mb-4">Thank you for helping us find bugs. Please tell us about anything that looks wrong. When the trial ends you drop back to free access unless you subscribe (US$6.99 per month, cancel any time). You will never be charged unless you choose to subscribe.</p>
        <GoldButton onClick={onDone}>Start exploring</GoldButton>
      </FormModal>
    );
  }

  if (step === 'declined') {
    return (
      <FormModal title="Application not approved" onClose={onDone}>
        <p className="text-sm text-ivory/85 mb-4">Your application was not approved, so the member areas are not available to you. You can still browse the Directory and buy from the Shop. If you think this is a mistake, email {CONTACT_EMAIL}.</p>
        <GoldButton onClick={onDone}>Close</GoldButton>
      </FormModal>
    );
  }

  return (
    <FormModal title="Start your 14 day free trial" onClose={onDone}>
      <p className="text-sm text-ivory/80 mb-3">You are approved. Welcome to the network. Membership gives you:</p>
      <ul className="text-sm text-ivory/80 space-y-1.5 mb-4 list-disc pl-5">
        <li>Other members can message you from the Directory</li>
        <li>Open a shop and list your products</li>
      </ul>
      <p className="text-xs text-ivory/60 mb-4">Everything else stays free: your Directory listing, sending messages, Skillswap, Events and Resources.</p>
      <GoldButton onClick={startTrial} disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Start free trial'}</GoldButton>
      <p className="text-[11px] text-ivory/50 mt-2">{SOFT_GOLD_NOTE} You will see the exact date your card is first charged before you confirm.</p>
      {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mt-3">{err}</p>}
      <button onClick={onDone} className="mt-4 text-sm text-ivory/60 hover:text-ivory underline underline-offset-2">Continue with free access</button>
    </FormModal>
  );
}

/* ---------------------------------------------------------
   Root App
--------------------------------------------------------- */

const TABS = [
  { key: 'directory', label: 'Directory', icon: Building2, Comp: DirectoryTab },
  { key: 'events', label: 'Events', icon: Calendar, Comp: EventsTab },
  { key: 'skillswap', label: 'Skillswap', icon: Users, Comp: SkillswapTab },
  { key: 'shop', label: 'Shop', icon: ShoppingBag, Comp: ShopTab },
  { key: 'resources', label: 'Resources', icon: FileText, Comp: ResourcesTab },
  { key: 'messages', label: 'Messages', icon: Inbox, Comp: MessagesTab },
];

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null); // { membership_tier, membership_status }
  const [tab, setTab] = useState('directory');
  const [showAuth, setShowAuth] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [membershipNotice, setMembershipNotice] = useState(null); // 'success' | 'cancelled' | null
  const [orderNotice, setOrderNotice] = useState(null); // 'success' | 'cancelled' | null
  const [connectReturn, setConnectReturn] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [rootLegal, setRootLegal] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(() => {
    if (!user) { setProfile(null); return; }
    supabase
      .from('profiles')
      .select('membership_tier, membership_status, member_status, is_admin, trial_ends_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data || { member_status: 'unconfirmed' }));
  }, [user]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Pick up ?membership=success|cancelled after returning from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('membership');
    const orderResult = params.get('order');
    if (result === 'success' || result === 'cancelled') {
      setMembershipNotice(result);
      params.delete('membership');
    }
    if (orderResult === 'success' || orderResult === 'cancelled') {
      setOrderNotice(orderResult);
      setTab('shop');
      params.delete('order');
    }
    const connectResult = params.get('connect');
    if (connectResult === 'return' || connectResult === 'refresh') {
      setConnectReturn(true);
      setTab('shop');
      params.delete('connect');
    }
    if (result || orderResult || connectResult) {
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  const [flowOpen, setFlowOpen] = useState(false);
  const status = user ? (profile ? (profile.member_status || 'unconfirmed') : null) : 'unconfirmed';
  const isApproved = status === 'approved';
  function handleApply() {
    if (!user) return setShowAuth(true);
    setFlowOpen(true);
  }

  async function handleUpgradeClick() {
    if (!user) return setShowAuth(true);
    if (!isApproved) return setFlowOpen(true);
    setUpgrading(true);
    const err = await startMembershipCheckout();
    if (err) { alert(err); setUpgrading(false); }
  }

  // After sign-in: new people see the eligibility step once; approved members finish their details and are offered the trial once.
  useEffect(() => {
    if (!user) { setFlowOpen(false); return; }
    if (!profile) return;
    let skipped = false; let trialSeen = false;
    try { skipped = localStorage.getItem(`tbja_onb_${user.id}`) === '1'; trialSeen = localStorage.getItem(`tbja_trial_${user.id}`) === '1'; } catch { /* ignore */ }
    const st = profile.member_status || 'unconfirmed';
    if (st === 'unconfirmed') { if (!skipped) setFlowOpen(true); return; }
    if (st === 'declined') return;
    supabase.from('business_private').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data && !skipped) setFlowOpen(true);
        else if (data && st === 'approved' && !profile.membership_status && !profile.trial_ends_at && !trialSeen) setFlowOpen(true);
      });
  }, [user, profile]);
  function finishOnboarding() {
    try {
      localStorage.setItem(`tbja_onb_${user.id}`, '1');
      if (isApproved) localStorage.setItem(`tbja_trial_${user.id}`, '1');
    } catch { /* ignore */ }
    setFlowOpen(false);
    loadProfile();
  }

  const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const betaActive = !!trialEnd && trialEnd > new Date() && profile?.membership_tier !== 'paid';
  const betaDaysLeft = betaActive ? Math.max(1, Math.ceil((trialEnd - new Date()) / 86400000)) : 0;
  const isPaid = profile?.membership_tier === 'paid' || betaActive;
  const active = TABS.find((t) => t.key === tab);
  const ActiveComp = active.Comp;

  return (
    <div className="min-h-screen bg-navy font-sans text-ivory">
      {/* Header */}
      <header className="bg-navy/90 backdrop-blur sticky top-0 z-40 border-b border-ivory/[0.07]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Logo className="h-11" />
          <nav className="hidden md:flex items-center gap-1 bg-surface rounded-full p-1 border border-ivory/[0.07]">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-gold text-navy' : 'text-ivory/70 hover:text-ivory'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user && status === 'unconfirmed' && (
              <button onClick={handleApply} className="flex items-center gap-1.5 text-xs font-semibold text-navy btn-gold rounded-full px-3.5 py-1.5 hover:brightness-110">
                <Crown size={13} /> Apply to join
              </button>
            )}
            {user && status === 'pending' && (
              <span className="whitespace-nowrap text-xs font-medium text-ivory/70 bg-ivory/[0.07] rounded-full px-3 py-1.5">Application pending</span>
            )}
            {user && isApproved && betaActive && (
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gold bg-gold/10 rounded-full px-3 py-1.5">
                <Crown size={13} /> Beta: {betaDaysLeft} {betaDaysLeft === 1 ? 'day' : 'days'} left
              </span>
            )}
            {user && isApproved && !betaActive && !IS_NATIVE_APP && (
              profile?.membership_tier === 'paid' ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-gold bg-gold/10 rounded-full px-3 py-1.5">
                  <Crown size={13} /> Member
                </span>
              ) : (
                <button
                  onClick={handleUpgradeClick}
                  disabled={upgrading}
                  className="flex items-center gap-1.5 text-xs font-semibold text-navy btn-gold rounded-full px-3.5 py-1.5 hover:brightness-110 disabled:opacity-50"
                >
                  {upgrading ? <Loader2 className="animate-spin" size={13} /> : <Crown size={13} />} {profile?.membership_status || profile?.trial_ends_at ? 'Subscribe' : 'Start free trial'}
                </button>
              )
            )}
            {user && (
              <button
                onClick={() => setShowAccount(true)}
                aria-label="My account"
                className="flex items-center gap-1.5 text-sm text-ivory/70 hover:text-ivory px-2 py-1.5"
              >
                <User size={16} /> <span className="hidden sm:inline">Account</span>
              </button>
            )}
            {user === undefined ? null : user ? (
              <button
                onClick={() => supabase.auth.signOut()}
                aria-label="Sign out"
                className="flex items-center gap-1.5 text-sm text-ivory/70 hover:text-ivory px-2 py-1.5"
              >
                <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-ivory border border-ivory/20 rounded-full px-4 py-1.5 hover:border-gold hover:text-gold"
              >
                <LogIn size={15} /> Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Beta banner */}
      <div className="bg-surface/60 border-b border-ivory/[0.07]">
        <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-ivory/60">
          Beta: 14 days free, then US$6.99/month. Cancel any time.
        </div>
      </div>

      {user && profile && !isApproved && (
        <div className="bg-gold/10 border-b border-gold/25">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-ivory/85 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {status === 'pending' && <span>Your application is being reviewed. Messaging, Skillswap, listing and selling open once you are approved.</span>}
            {status === 'declined' && <span>Your application was not approved. You can still browse the Directory and buy from the Shop.</span>}
            {status === 'unconfirmed' && (
              <>
                <span>You have buyer access: browse the Directory and buy from the Shop. The network is for women in business.</span>
                <button onClick={handleApply} className="text-gold font-semibold underline underline-offset-2">Apply to join</button>
              </>
            )}
          </div>
        </div>
      )}

      {membershipNotice === 'success' && (
        <div className="bg-gold/20 border-b border-gold/40">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-gold font-medium flex items-center justify-center gap-2">
            <Crown size={13} /> Welcome in. Your membership is active and your free trial has started.
            <button onClick={() => setMembershipNotice(null)} className="text-gold/70 hover:text-gold"><X size={13} /></button>
          </div>
        </div>
      )}
      {membershipNotice === 'cancelled' && (
        <div className="bg-wine border-b border-wine">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-ivory font-medium flex items-center justify-center gap-2">
            Checkout was cancelled. No payment was taken.
            <button onClick={() => setMembershipNotice(null)} className="text-ivory/70 hover:text-ivory"><X size={13} /></button>
          </div>
        </div>
      )}

      {orderNotice && (
        <div className={orderNotice === 'success' ? 'bg-gold/20 border-b border-gold/40' : 'bg-wine border-b border-wine'}>
          <div className={`max-w-5xl mx-auto px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 ${orderNotice === 'success' ? 'text-gold' : 'text-ivory'}`}>
            {orderNotice === 'success' ? 'Thank you! Your order is confirmed. Check your email for the receipt. The seller will be in touch to arrange delivery.' : 'Checkout was cancelled. No payment was taken.'}
            <button onClick={() => setOrderNotice(null)}><X size={13} /></button>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 pt-8 pb-28 md:pb-12">
        <h1 className="font-display text-3xl text-ivory mb-6">{active.label}</h1>
        <ActiveComp user={user} onRequireAuth={() => setShowAuth(true)} openPanel={connectReturn} isPaid={isPaid} onUpgrade={handleUpgradeClick} isApproved={isApproved} status={status} onApply={handleApply} />
      </main>

      <footer className="hidden md:block border-t border-ivory/[0.07] py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-ivory/40">
          The Boardroom JA. Build the table. Don't wait for a seat.
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-navy/95 backdrop-blur border-t border-ivory/[0.08] pb-safe">
        <div className="grid grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); window.scrollTo({ top: 0 }); }}
              className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[10px] font-medium transition-colors ${
                tab === t.key ? 'text-gold' : 'text-ivory/55'
              }`}
            >
              <t.icon size={20} strokeWidth={tab === t.key ? 2 : 1.6} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthed={() => {}} />
      )}
      {flowOpen && user && profile && <OnboardingFlow user={user} status={status} hasBeta={!!profile.trial_ends_at} betaDays={betaDaysLeft} onApplied={loadProfile} onDone={finishOnboarding} />}
      {showAccount && user && <AccountModal user={user} profile={profile} betaActive={betaActive} betaDaysLeft={betaDaysLeft} onSubscribe={() => { setShowAccount(false); handleUpgradeClick(); }} onClose={() => setShowAccount(false)} onLegal={setRootLegal} />}
      {rootLegal === 'terms' && <LegalModal title="Terms of Use" text={TERMS_OF_USE_TEXT} onClose={() => setRootLegal(null)} />}
      {rootLegal === 'privacy' && <LegalModal title="Privacy Policy" text={PRIVACY_POLICY_TEXT} onClose={() => setRootLegal(null)} />}
    </div>
  );
}
