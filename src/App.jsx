import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { pushSupported, isIOS, isInstalledApp, currentPushState, enablePush, disablePush } from './lib/push';
import { PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT } from './lib/legalText';
import { SELLER_TERMS_TEXT, COMMISSION_PCT, PAYMENT_TERMS_DAYS } from './lib/sellerTerms';
import { REGIONS, regionLabel } from './lib/places';
import { COUNTRIES, REFUND_POLICIES, REFUND_OPTIONS, STATUTORY_NOTE, scheduleFor, needsDigitalWaiver, payoutRoute, MIN_PAYOUT } from './lib/legalSchedules';
import {
  Calendar, Users, ShoppingBag, FileText, LogIn, LogOut,
  MapPin, X, Download, ExternalLink, Loader2, Sparkles, Building2,
  MessageCircle, Send, Search, ShieldCheck, Inbox, Plus, Crown,
  Shirt, Utensils, Home, Palette, Briefcase, GraduationCap, Printer, Package, Store, Truck, ArrowLeft, TrendingUp, Check, Star, Flag, Ban, User, Trash2, Lock,
  Menu, Bell, BellRing, ChevronRight, Gift, Megaphone, Eye, CalendarClock, CheckCheck, Settings, Tag
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
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-2 -mr-3 flex items-center justify-center text-ivory/60 hover:text-ivory"><X size={18} /></button>
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
    <img src="/logo.png" alt="The Boardroom" className={`${className} w-auto object-contain`} />
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
  const cls = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-full btn-gold text-navy text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed';
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
          Beta. Join the room: 14 days of full membership free, then US$5.99/month. Cancel any time.
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

const SOFT_GOLD_NOTE = 'Card required. Free for 14 days, then US$5.99 per month. Cancel any time.';

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
      <button type="button" onClick={(e) => { e.stopPropagation(); user ? setOpen(true) : onRequireAuth && onRequireAuth(); }} className="text-[11px] text-ivory/50 hover:text-ivory/75 inline-flex items-center gap-1 min-h-[44px] pr-3" aria-label={label}>
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
      : 'The Boardroom is a network for women in business. Everyone can browse the Directory and buy from the Shop. Apply to join to unlock this.';
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
              {r.website_url && /^https?:\/\//i.test(r.website_url) && <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline inline-flex items-center gap-1 min-h-[44px]">Website <ExternalLink size={11} /></a>}
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
              <button onClick={onSubscribe} className="text-sm text-gold underline underline-offset-2 block mb-1">Subscribe, US$5.99 per month</button>
            )}
            {profile?.membership_status && profile.membership_status !== 'canceled' && (
              <button onClick={manageBilling} disabled={billBusy} className="text-sm text-gold underline underline-offset-2">{billBusy ? 'Opening…' : 'Manage or cancel membership'}</button>
            )}
            {billErr && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mt-2">{billErr}</p>}
          </div>
          <div>
            <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Notifications</h4>
            <NotificationSettings user={user} />
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

const BUSINESS_CATEGORIES = [
  'Accounting and Finance', 'Agriculture and Food Production', 'Arts, Crafts and Culture', 'Beauty and Wellness',
  'Business Consulting', 'Construction and Real Estate', 'Creative and Design', 'Education and Training',
  'Events and Hospitality', 'Fashion and Apparel', 'Food and Beverage', 'Health and Medical', 'Legal Services',
  'Logistics and Transport', 'Marketing and Media', 'Non-profit and Community', 'Procurement and Services',
  'Retail and E-commerce', 'Technology and IT', 'Tourism and Travel', 'Other',
];

function ListBusinessForm({ user, existing, onClose, onSaved, onboarding = false, pendingReview = false }) {
  const [form, setForm] = useState({
    business_name: existing?.business_name || '',
    category: existing?.category || '',
    description: existing?.description || '',
    country: existing?.country || '',
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
    const need = ['business_name', 'category', 'description', 'country', 'contact_email', 'is_registered'];
    if (need.some((f) => !form[f]?.trim())) return setError('Please fill in all required fields.');
    if (form.is_registered !== 'no' && !form.registered_countries.trim()) return setError('Please choose which country or countries the business is registered in.');
    if (REGIONS[form.country] && !form.parish.trim()) return setError(`Please choose your ${regionLabel(form.country).toLowerCase()}.`);
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
    // Contact details stay private, so they are never written to (or read back from) the public listing row.
    const listing = {
      business_name: form.business_name.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      country: form.country.trim(),
      parish: form.parish.trim(),
      website_url: (() => { const w = form.website_url.trim(); return !w ? null : /^https?:\/\//i.test(w) ? w : `https://${w}`; })(),
      is_active: consent,
      directory_consent_at: consent ? (existing?.directory_consent_at || now) : null,
    };
    const { data: row } = await supabase.from('business_directory').select('id').eq('user_id', user.id).maybeSingle();
    const { error: e2 } = row
      ? await supabase.from('business_directory').update(listing).eq('user_id', user.id)
      : await supabase.from('business_directory').insert({ user_id: user.id, ...listing });
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
    <div className="fixed inset-0 z-50 bg-black/60 flex p-4 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="bg-surface max-w-lg w-full p-5 sm:p-7 my-auto mx-auto border border-ivory/10 rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-display text-xl text-ivory">{onboarding ? 'Welcome. Tell us about your business' : existing ? 'Edit your listing' : 'List your business'}</h2>
          <button onClick={onClose} className="text-ivory/60 hover:text-ivory" aria-label="Close"><X size={18} /></button>
        </div>
        {onboarding && <p className="text-xs text-ivory/60 mb-4">{pendingReview ? 'Our team reviews every application. Only the fields marked "Shown publicly" will appear to other people, and only once you are approved.' : 'This sets up your Directory listing. Only the fields marked "Shown publicly" appear to other people.'}</p>}
        <form onSubmit={handleSubmit} className={onboarding ? '' : 'mt-3'}>
          <div className="mb-3">{lbl('Business name', true, PUBLIC)}<input className={inputCls} value={form.business_name} onChange={(e) => update('business_name', e.target.value)} /></div>
          <div className="mb-3">{lbl('Industry / category', true, PUBLIC)}
            <select className={inputCls} value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">Choose a category…</option>
              {(form.category && !BUSINESS_CATEGORIES.includes(form.category) ? [form.category, ...BUSINESS_CATEGORIES] : BUSINESS_CATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-3">{lbl('Description', true, PUBLIC)}<textarea rows={3} className={inputCls} value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
          <div className="mb-3">{lbl('Country', true, PUBLIC)}
            <select className={inputCls} value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, parish: '' }))}>
              <option value="">Choose a country…</option>
              {COUNTRIES.map((c) => <option key={c[0]} value={c[1]}>{c[1]}</option>)}
            </select>
          </div>
          {form.country && (
            <div className="mb-3">{lbl(regionLabel(form.country), !!REGIONS[form.country], PUBLIC)}
              {REGIONS[form.country] ? (
                <select className={inputCls} value={form.parish} onChange={(e) => update('parish', e.target.value)}>
                  <option value="">Choose…</option>
                  {(form.parish && !REGIONS[form.country].items.includes(form.parish) ? [form.parish, ...REGIONS[form.country].items] : REGIONS[form.country].items).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <input className={inputCls} maxLength={100} value={form.parish} onChange={(e) => update('parish', e.target.value)} placeholder="Optional" />
              )}
            </div>
          )}
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
              <div className="mb-3">{lbl('Which country or countries is it registered in?', true, PRIVATE)}
                {(() => {
                  const picked = form.registered_countries.split(',').map((x) => x.trim()).filter(Boolean);
                  const set = (arr) => update('registered_countries', arr.join(', '));
                  return (
                    <>
                      {picked.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {picked.map((c) => (
                            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 text-ivory text-xs pl-3 pr-1.5 py-1">
                              {c}
                              <button type="button" aria-label={`Remove ${c}`} onClick={() => set(picked.filter((x) => x !== c))} className="w-6 h-6 rounded-full hover:bg-ivory/10 inline-flex items-center justify-center"><X size={12} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <select className={inputCls} value="" onChange={(e) => { const v = e.target.value; if (v && !picked.includes(v)) set([...picked, v]); }}>
                        <option value="">{picked.length ? 'Add another country…' : 'Choose a country…'}</option>
                        {COUNTRIES.filter((c) => !picked.includes(c[1])).map((c) => <option key={c[0]} value={c[1]}>{c[1]}</option>)}
                      </select>
                    </>
                  );
                })()}
              </div>
            )}
            <div className="mb-3">{lbl('Your name', false, PRIVATE)}<input className={inputCls} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} /></div>
            <div className="mb-3">{lbl('Contact email', true, PRIVATE)}<input type="email" className={inputCls} value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} /></div>
            <div>{lbl('Phone / WhatsApp', false, PRIVATE)}<input className={inputCls} value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-ivory/80 mb-4 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#D4A33A]" />
            <span>Show my business in the member Directory (business name, category, description, country, region and website only). You can change this any time. Other members can message you if you have an active membership.</span>
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
  const [cat, setCat] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [myListing, setMyListing] = useState(null);
  const [thread, setThread] = useState(null); // { otherUserId, otherName }
  const [messageable, setMessageable] = useState(new Set());
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('business_directory')
      .select('id, user_id, business_name, category, description, country, parish, website_url, logo_url, is_active, created_at')
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
      const { data: mine } = await supabase.rpc('my_listing');
      setMyListing((Array.isArray(mine) ? mine[0] : mine) || null);
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
    supabase.rpc('record_view', { p_type: 'listing', p_id: biz.id }).then(() => {}, () => {});
    setThread({ otherUserId: biz.user_id, otherName: biz.business_name });
  }

  const catCounts = {};
  (businesses || []).forEach((b) => { if (b.category) catCounts[b.category] = (catCounts[b.category] || 0) + 1; });
  const catOptions = Object.keys(catCounts).sort((a, b) => a.localeCompare(b));
  const filtered = (businesses || []).filter((b) => {
    if (cat && b.category !== cat) return false;
    const q = query.trim().toLowerCase();
    return !q || [b.business_name, b.category, b.parish, b.country, b.description].some((v) => v && v.toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-grow">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by keyword, name or place…"
            className={inputCls + ' pl-9'}
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category" className={inputCls + ' sm:w-60'}>
          <option value="">All categories</option>
          {catOptions.map((c) => <option key={c} value={c}>{c} ({catCounts[c]})</option>)}
        </select>
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
        <div className="text-center">
          <EmptyState icon={Building2} title="No businesses found" body="Try a different keyword or category, or be the first to list your business." />
          {(query || cat) && <button onClick={() => { setQuery(''); setCat(''); }} className="text-sm text-gold underline underline-offset-2">Clear search and category</button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((b) => (
            <Card key={b.id} className="p-5 flex flex-col">
              <SectionLabel>{b.category}</SectionLabel>
              <h3 className="font-sans font-semibold text-lg tracking-tight text-ivory mb-1"><button type="button" onClick={() => setDetail(b)} className="text-left hover:text-gold min-h-[44px]">{b.business_name}</button></h3>
              <p className="text-xs text-ivory/55 mb-2 flex items-center gap-1"><MapPin size={12} /> {[b.parish, b.country].filter(Boolean).join(', ')}</p>
              {b.review_count > 0 && <div className="mb-2 flex items-center gap-2"><StarRating value={b.avg_rating} count={b.review_count} /><span className="text-[11px] text-ivory/45">verified shop buyers</span></div>}
              <p className="text-sm text-ivory/75 mb-4 flex-grow line-clamp-4">{b.description}</p>
              <div className="flex items-center gap-2 mt-auto pt-2">
                {b.website_url && (
                  <a href={b.website_url.startsWith('http') ? b.website_url : `https://${b.website_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline flex items-center gap-1 min-h-[44px] pr-2">
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
      {detail && (
        <ListingModal
          biz={detail}
          user={user}
          canMessage={!!user && detail.user_id !== user.id && messageable.has(detail.user_id)}
          onMessage={() => { const b = detail; setDetail(null); handleMessageClick(b); }}
          onClose={() => setDetail(null)}
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
        Listing costs nothing{paid ? `. If you sell tickets or products, The Boardroom keeps ${COMMISSION_PCT}% of the sale after Stripe transaction fees, and you are paid within ${PAYMENT_TERMS_DAYS} days.` : ', and free events stay free.'}
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
    <div className="fixed inset-0 z-50 bg-black/60 flex p-4 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="bg-surface max-w-lg w-full p-5 sm:p-7 my-auto mx-auto border border-ivory/10 rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-display text-xl text-ivory">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-2 -mr-3 flex items-center justify-center text-ivory/60 hover:text-ivory"><X size={18} /></button>
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

function EventForm({ user, isAdmin, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', description: '', event_date: '', location: '', city: '', country: '', is_online: false, host_name: '', event_type: 'rsvp', price_text: '', ticket_checkout_url: '', external_url: '' });
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
    if (ticketed && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(f.ticket_checkout_url.trim())) return setError('The ticket link must start with https://');
    if (ticketed && !agreed) return setError('Please agree to the Seller and Organizer Terms.');
    if (!f.is_online && (!f.city.trim() || !f.country)) return setError('Please add the city and country, or mark the event as online.');
    setSaving(true); setError('');
    const { error: err } = await supabase.from('events').insert({
      title: f.title.trim(),
      description: f.description.trim() || null,
      event_date: new Date(f.event_date).toISOString(),
      location: f.is_online ? (f.location.trim() || 'Online') : (f.location.trim() || null),
      is_online: f.is_online,
      city: f.is_online ? null : f.city.trim().slice(0, 80),
      country: f.is_online ? null : f.country,
      host_name: f.host_name.trim() || null,
      event_type: f.event_type,
      price_text: ticketed ? f.price_text.trim() : 'Free',
      ticket_checkout_url: ticketed ? f.ticket_checkout_url.trim() : null,
      external_url: f.external_url.trim() || null,
      created_by: user.id,
      review_status: isAdmin ? 'approved' : 'pending',
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
        <FField label="Event name" required><input className={inputCls} maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></FField>
        <FField label="Date and time" required><input type="datetime-local" className={inputCls} value={f.event_date} onChange={(e) => set('event_date', e.target.value)} /></FField>
        <FField label="Where is it?">
          <div className="flex gap-2">
            {[[false, 'In person'], [true, 'Online']].map(([v, l]) => (
              <button key={l} type="button" onClick={() => set('is_online', v)}
                className={`px-4 min-h-[44px] text-sm font-medium rounded-full border ${f.is_online === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
            ))}
          </div>
        </FField>
        {!f.is_online && (
          <>
            <FField label="Country" required><CountrySelect value={f.country} onChange={(v) => set('country', v)} /></FField>
            <FField label="City or town" required><input className={inputCls} maxLength={80} value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Kingston" /></FField>
          </>
        )}
        <FField label={f.is_online ? 'Link or details (optional)' : 'Venue or address'}><input className={inputCls} maxLength={200} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder={f.is_online ? 'Online' : 'Venue name'} /></FField>
        <FField label="Hosted by"><input className={inputCls} maxLength={150} value={f.host_name} onChange={(e) => set('host_name', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} maxLength={3000} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Event type">
          <div className="flex gap-2">
            {[['rsvp', 'Free (RSVP)'], ['ticketed', 'Ticketed']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('event_type', v)}
                className={`px-4 min-h-[44px] text-sm font-medium rounded-full border ${f.event_type === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
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
        <p className="text-xs text-ivory/50 mb-4">{isAdmin ? 'As an admin your event goes live straight away.' : 'We review every listing before it goes live, usually within a couple of days.'}{(ticketed || isAdmin) ? ' Members in the same city get a reminder a week before.' : ''}</p>
        <GoldButton type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : isAdmin ? 'Publish event' : 'Submit for review'}</GoldButton>
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

function EventsTab({ user, onRequireAuth, isAdmin, isApproved, status, onApply }) {
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
      <GoldButton onClick={() => (!user ? onRequireAuth() : (isApproved || isAdmin) ? setShowForm(true) : status === 'unconfirmed' ? onApply() : null)}><Plus size={15} /> {!user || isApproved || isAdmin ? 'List an event' : status === 'pending' ? 'Application pending' : status === 'declined' ? 'Not available' : 'Apply to join to list an event'}</GoldButton>
    </div>
  );
  const formModal = showForm && (
    <EventForm user={user} isAdmin={isAdmin} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); if (isAdmin) load(); else setSubmitted(true); }} />
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
            {(ev.is_online || ev.location || ev.city) && (
              <p className="text-xs text-ivory/55 mb-3 flex items-center gap-1"><MapPin size={12} /> {ev.is_online ? `Online${ev.location && ev.location !== 'Online' ? ' - ' + ev.location : ''}` : [ev.location, ev.city, ev.country].filter(Boolean).join(', ')}</p>
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
            {ev.event_type === 'ticketed' && <p className="text-[11px] text-ivory/45 mt-2">Tickets are sold by the organiser on their own page. The Boardroom does not take this payment, so check the details before you pay.</p>}
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
            className={`px-4 min-h-[44px] text-sm font-medium rounded-full border ${view === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70 hover:border-ivory/40'}`}
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
                    className="flex-shrink-0 flex items-center gap-1 min-h-[44px] px-2 text-xs uppercase tracking-wide text-mint hover:underline"
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
        <button onClick={() => onOpenShop(p.shop_id)} className="px-4 pb-3 min-h-[44px] text-left text-xs text-ivory/55 hover:text-gold">
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
          <span>I agree that The Boardroom shares my details with {shop?.name} so they can deliver my order. See our{' '}
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
  useEffect(() => {
    if (user && product.seller_id !== user.id) supabase.rpc('record_view', { p_type: 'product', p_id: product.id }).then(() => {}, () => {});
  }, [product.id, product.seller_id, user]);
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
  const [f, setF] = useState({ name: '', description: '', country: '', order_email: user.email || '', refund_policy: 'days_14', payout_country: '' });
  const [payAck, setPayAck] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logo, setLogo] = useState(null);
  const LOGO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!LOGO_EXT[file.type]) { setError('Please choose a JPG, PNG or WebP image.'); e.target.value = ''; return; }
    if (file.size > 2 * 1024 * 1024) { setError('The logo must be under 2 MB.'); e.target.value = ''; return; }
    setError(''); setLogo(file);
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.order_email.trim() || !f.country.trim()) return setError('Please add a shop name, country and order email.');
    if (!f.payout_country) return setError('Please choose the country where your bank account is.');
    if (payoutRoute(f.payout_country) === 'manual' && !payAck) return setError('Please confirm you understand payouts to your country are manual.');
    if (!agreed) return setError('Please agree to the Seller and Organizer Terms.');
    setSaving(true); setError('');
    let logoUrl = null;
    if (logo) {
      const path = `${user.id}/${crypto.randomUUID()}.${LOGO_EXT[logo.type]}`;
      const { error: upErr } = await supabase.storage.from('product-images').upload(path, logo, { contentType: logo.type });
      if (upErr) { setSaving(false); return setError('Could not upload the logo. Please try again.'); }
      logoUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const slug = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error: err } = await supabase.from('shops').insert({
      owner_id: user.id, name: f.name.trim(), slug, description: f.description.trim() || null,
      country: f.country, order_email: f.order_email.trim(), logo_url: logoUrl, refund_policy: f.refund_policy,
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
        <FField label="Shop name" required><input className={inputCls} maxLength={150} value={f.name} onChange={(e) => set('name', e.target.value)} /></FField>
        <FField label="About your shop"><textarea rows={3} className={inputCls} maxLength={3000} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
        <FField label="Country you sell from" required><CountrySelect value={f.country} onChange={(v) => set('country', v)} /></FField>
        <RightsPanel country={f.country} heading="Laws that apply to you as a seller" />
        <FField label="Your default refund policy"><RefundPicker type="physical" value={f.refund_policy} onChange={(v) => set('refund_policy', v)} /></FField>
        <FField label="Email for order notifications" required><input type="email" className={inputCls} value={f.order_email} onChange={(e) => set('order_email', e.target.value)} /></FField>
        <FField label="Shop logo (optional)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} className="block w-full text-sm text-ivory/70 file:mr-3 file:min-h-[44px] file:px-4 file:rounded-full file:border-0 file:bg-gold file:text-navy file:font-semibold" /><p className="text-[11px] text-ivory/45 mt-1">JPG, PNG or WebP, under 2 MB.</p></FField>
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
  const [f, setF] = useState({ name: '', description: '', category: SHOP_CATEGORIES[0].name, product_type: 'physical', price: '', currency: 'USD', delivery_notes: '', stock_status: 'in_stock', refund_policy: shop.refund_policy || 'days_14' });
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [img, setImg] = useState(null);
  const [preview, setPreview] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMG_EXT[file.type]) { setError('Please choose a JPG, PNG or WebP photo.'); e.target.value = ''; return; }
    if (file.size > 2 * 1024 * 1024) { setError('The photo must be under 2 MB.'); e.target.value = ''; return; }
    setError('');
    if (preview) URL.revokeObjectURL(preview);
    setImg(file); setPreview(URL.createObjectURL(file));
  }

  async function submit(e) {
    e.preventDefault();
    const price = Math.round(parseFloat(f.price) * 100);
    if (!f.name.trim() || !(price > 0)) return setError('Please add a name and a price.');
    if (!agreed) return setError('Please agree to the Seller and Organizer Terms.');
    setSaving(true); setError('');
    let imageUrl = null;
    if (img) {
      const path = `${user.id}/${crypto.randomUUID()}.${IMG_EXT[img.type]}`;
      const { error: upErr } = await supabase.storage.from('product-images').upload(path, img, { contentType: img.type });
      if (upErr) { setSaving(false); return setError('Could not upload the photo. Please try again.'); }
      imageUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const { error: err } = await supabase.from('products').insert({
      shop_id: shop.id, seller_id: user.id, name: f.name.trim(), description: f.description.trim() || null,
      category: f.category, product_type: f.product_type, price_cents: price, currency: f.currency,
      refund_policy: policyValue, price_text: formatMoney(price, f.currency), image_url: imageUrl,
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
      className={`px-4 min-h-[44px] text-sm font-medium rounded-full border ${f[k] === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
  );

  return (
    <FormModal title="Add a product" onClose={onClose}>
      <form onSubmit={submit}>
        <FField label="Name" required><input className={inputCls} maxLength={150} value={f.name} onChange={(e) => set('name', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} maxLength={3000} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
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
        <FField label="Product photo (JPG, PNG or WebP, up to 2 MB)">
          {preview && <img src={preview} alt="Preview" className="w-full max-h-48 object-cover rounded-xl mb-2" />}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} className="block w-full text-sm text-ivory/70 file:mr-3 file:min-h-[44px] file:px-4 file:rounded-full file:border-0 file:bg-gold file:text-navy file:font-semibold" />
        </FField>
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
      const { data: d } = await supabase.from('business_directory').select('user_id, business_name, category, description, country, parish, website_url, logo_url').in('user_id', owners).eq('is_active', true);
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
            className={`px-4 min-h-[44px] text-sm font-medium rounded-full border ${type === v ? 'bg-gold text-navy border-gold' : 'border-ivory/20 text-ivory/70'}`}>{l}</button>
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
              {(dir?.parish || shop.country) && <p className="text-xs text-ivory/50 mb-1 flex items-center gap-1"><MapPin size={11} /> {[dir?.parish, dir?.country || shop.country].filter(Boolean).join(', ')}</p>}
              {about && <p className="text-sm text-ivory/75 mb-1">{about}</p>}
              {dir?.website_url && /^https?:\/\//i.test(dir.website_url) && <a href={dir.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mint hover:underline inline-flex items-center gap-1 min-h-[44px]">Website <ExternalLink size={11} /></a>}
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
        <FField label="Title" required><input className={inputCls} maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></FField>
        <FField label="Description"><textarea rows={3} className={inputCls} maxLength={3000} value={f.description} onChange={(e) => set('description', e.target.value)} /></FField>
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
      <FormModal title="Welcome to The Boardroom" onClose={onDone}>
        <p className="text-sm text-ivory/85 mb-3">The Boardroom is a network for women in business. It is open to women, including trans women.</p>
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
        <p className="text-xs text-ivory/60 mb-4">Thank you for helping us find bugs. Please tell us about anything that looks wrong. When the trial ends you drop back to free access unless you subscribe (US$5.99 per month, cancel any time). You will never be charged unless you choose to subscribe.</p>
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
   v9 app shell: dashboard, ads, notifications, drawer, admin tools
--------------------------------------------------------- */

const SECTION_LINKS = [
  ['tab:home', 'Dashboard'], ['tab:directory', 'Directory'], ['tab:events', 'Events'], ['tab:skillswap', 'Skills Swap'],
  ['tab:shop', 'Shop'], ['tab:resources', 'Resources'], ['tab:benefits', 'Benefits'], ['tab:jobs', 'Jobs'], ['tab:messages', 'Messages'],
];

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function firstNameOf(profile, user) {
  const raw = (profile?.full_name || '').trim() || (user?.email ? user.email.split('@')[0] : '');
  const first = raw.split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

function Avatar({ profile, user, size = 36 }) {
  const initial = (firstNameOf(profile, user) || '?').charAt(0).toUpperCase();
  const style = { width: size, height: size };
  if (profile?.avatar_url && /^https:\/\//.test(profile.avatar_url)) {
    return <img src={profile.avatar_url} alt="" style={style} className="rounded-full object-cover border border-gold/40" />;
  }
  return (
    <span style={style} className="rounded-full btn-gold text-navy font-semibold flex items-center justify-center" aria-hidden="true">
      <span style={{ fontSize: size * 0.45 }}>{initial}</span>
    </span>
  );
}

function SampleTag() {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-ivory/55 bg-ivory/10 rounded-full px-2 py-0.5">Sample</span>;
}

/* ---------- Rotating ads ---------- */

const HOUSE_ADS = [
  { id: 'h1', isHouse: true, title: 'Open your shop', subtitle: 'Sell products and services to the network. We keep it simple.', link_type: 'internal', link_target: 'tab:shop' },
  { id: 'h2', isHouse: true, title: 'List your business', subtitle: 'Get found in the member Directory by keyword and category.', link_type: 'internal', link_target: 'tab:directory' },
  { id: 'h3', isHouse: true, title: 'Swap skills with other women', subtitle: 'Offer what you do well. Ask for what you need.', link_type: 'internal', link_target: 'tab:skillswap' },
  { id: 'h4', isHouse: true, title: 'Free resources, ready to use', subtitle: 'Templates, guides and checklists from the community.', link_type: 'internal', link_target: 'tab:resources' },
];
const AD_BG = [
  'from-emerald/70 via-emerald/30 to-surface',
  'from-wine/70 via-wine/30 to-surface',
  'from-gold/35 via-gold/10 to-surface',
  'from-mint/45 via-emerald/25 to-surface',
];

function AdCarousel({ ads, onOpen }) {
  const list = ads.slice(0, 4);
  const n = list.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [x0, setX0] = useState(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (n < 2 || paused || reduce) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n, paused, reduce]);
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  if (!n) return null;
  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="relative">
      <div
        className="overflow-hidden rounded-3xl border border-ivory/[0.08]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => { setPaused(true); setX0(e.touches[0].clientX); }}
        onTouchEnd={(e) => {
          if (x0 !== null) {
            const dx = e.changedTouches[0].clientX - x0;
            if (Math.abs(dx) > 40) setI((v) => (dx < 0 ? (v + 1) % n : (v - 1 + n) % n));
          }
          setX0(null); setPaused(false);
        }}
      >
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
          {list.map((ad, k) => (
            <button
              key={ad.id}
              type="button"
              onClick={() => onOpen(ad)}
              aria-hidden={k !== i}
              tabIndex={k === i ? 0 : -1}
              className={`relative w-full shrink-0 text-left min-h-[128px] p-5 bg-gradient-to-br ${AD_BG[k % 4]} overflow-hidden active:brightness-95`}
            >
              {ad.image_url && /^https:\/\//.test(ad.image_url) && (
                <>
                  <img src={ad.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/60 to-navy/10" />
                </>
              )}
              <span className="relative block max-w-[78%]">
                <span className="block font-display text-xl leading-tight text-ivory">{ad.title}</span>
                {ad.subtitle && <span className="block text-sm text-ivory/80 mt-1.5 line-clamp-2">{ad.subtitle}</span>}
                <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-gold">
                  {ad.link_type === 'external' ? 'Visit' : 'Open'} <ChevronRight size={14} />
                </span>
              </span>
              {!ad.isHouse && <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider text-ivory/70 bg-navy/60 rounded-full px-2 py-0.5">Ad</span>}
            </button>
          ))}
        </div>
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-1.5 mt-2.5">
          {list.map((ad, k) => (
            <button key={ad.id} type="button" aria-label={`Show item ${k + 1}`} onClick={() => setI(k)} className="p-[18px] -m-[18px]">
              <span className={`block h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-gold' : 'w-1.5 bg-ivory/25'}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Push permission (friendly prompt, never on first load) ---------- */

function PushPromptModal({ onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ios = isIOS();
  const needsInstall = ios && !isInstalledApp();
  async function allow() {
    setBusy(true); setErr('');
    try { await enablePush(); onDone(); } catch (e) { setErr(e.message || 'Something went wrong.'); setBusy(false); }
  }
  return (
    <FormModal title="Stay in the loop" onClose={onClose}>
      <div className="flex justify-center mb-4"><span className="w-14 h-14 rounded-full bg-gold/15 text-gold flex items-center justify-center"><BellRing size={26} /></span></div>
      <p className="text-sm text-ivory/85 mb-3">Get a quick alert on your phone, even when the app is closed, for:</p>
      <ul className="text-sm text-ivory/75 space-y-1.5 mb-4 list-disc pl-5">
        <li>Events coming up in 7 days</li>
        <li>Announcements from The Boardroom</li>
        <li>When a member views your listing or products</li>
      </ul>
      <p className="text-xs text-ivory/55 mb-4">You choose which alerts you get, and you can switch them off at any time in My account, Notifications.</p>
      {needsInstall ? (
        <div className="rounded-2xl bg-gold/10 border border-gold/25 px-4 py-3 text-sm text-ivory/85 mb-4">
          On iPhone, first add the app to your Home Screen: tap the Share button in Safari, choose "Add to Home Screen", then open the app from your Home Screen and come back here.
        </div>
      ) : !pushSupported() ? (
        <div className="rounded-2xl bg-wine/40 border border-wine px-4 py-3 text-sm text-ivory/85 mb-4">This browser cannot receive phone notifications. Try Chrome on Android, or Safari on iPhone with the app added to your Home Screen.</div>
      ) : null}
      {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
      <div className="flex flex-col gap-2">
        <GoldButton onClick={allow} disabled={busy || needsInstall || !pushSupported()}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Allow notifications'}</GoldButton>
        <button type="button" onClick={onClose} className="min-h-[44px] text-sm text-ivory/70 hover:text-ivory">Not now</button>
      </div>
    </FormModal>
  );
}

/* ---------- Notification settings (also used in My account) ---------- */

const NOTIF_TYPES = [
  ['profile_views', 'Directory views', 'When someone views your directory listing'],
  ['product_views', 'Product views', 'A daily count when members view your products'],
  ['announcements', 'Announcements', 'News and updates from The Boardroom'],
  ['event_reminders', 'Event reminders', 'A reminder 7 days before an event, in your local time'],
];

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${checked ? 'bg-gold' : 'bg-ivory/20'}`}>
      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function NotificationSettings({ user }) {
  const [s, setS] = useState(null);
  const [pushState, setPushState] = useState('off');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    supabase.from('notification_settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setS(data || { profile_views: true, product_views: true, announcements: true, event_reminders: true, push_enabled: true, share_views: true }));
    currentPushState().then(setPushState);
  }, [user.id]);

  async function save(patch) {
    const next = { ...s, ...patch };
    setS(next);
    const row = { user_id: user.id, profile_views: next.profile_views, product_views: next.product_views, announcements: next.announcements, event_reminders: next.event_reminders, push_enabled: next.push_enabled, share_views: next.share_views, city: (next.city || '').trim().slice(0, 80) || null, country: next.country || null };
    const { error } = await supabase.from('notification_settings').upsert(row, { onConflict: 'user_id' });
    if (error) setErr('Could not save that. Please try again.');
  }

  async function turnOffPush() {
    setBusy(true);
    await disablePush();
    setPushState(await currentPushState());
    setBusy(false);
  }

  if (!s) return <Spinner />;
  return (
    <div className="space-y-5">
      {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs">{err}</p>}
      <div className="rounded-2xl bg-navy/50 p-4">
        <p className="text-sm font-medium text-ivory mb-1">Phone notifications</p>
        {pushState === 'on' && <p className="text-xs text-ivory/60 mb-3">On for this device. You will get alerts even when the app is closed.</p>}
        {pushState === 'off' && <p className="text-xs text-ivory/60 mb-3">Off for this device.</p>}
        {pushState === 'blocked' && <p className="text-xs text-ivory/60 mb-3">Blocked in your phone or browser settings. Allow notifications for this app there, then come back.</p>}
        {pushState === 'unsupported' && <p className="text-xs text-ivory/60 mb-3">This browser cannot receive phone notifications. On iPhone, add the app to your Home Screen first.</p>}
        {pushState === 'on' ? (
          <button type="button" onClick={turnOffPush} disabled={busy} className="min-h-[44px] text-sm text-gold underline underline-offset-2">Turn off on this device</button>
        ) : pushState !== 'blocked' && pushState !== 'unsupported' ? (
          <GoldButton onClick={() => setPrompt(true)}><Bell size={14} /> Allow notifications</GoldButton>
        ) : null}
      </div>
      <div className="space-y-1">
        {NOTIF_TYPES.map(([k, label, hint]) => (
          <div key={k} className="flex items-center gap-3 min-h-[56px]">
            <div className="flex-grow"><p className="text-sm text-ivory">{label}</p><p className="text-xs text-ivory/50">{hint}</p></div>
            <Toggle checked={!!s[k]} onChange={(v) => save({ [k]: v })} label={label} />
          </div>
        ))}
        <div className="flex items-center gap-3 min-h-[56px]">
          <div className="flex-grow"><p className="text-sm text-ivory">Alerts on my phone</p><p className="text-xs text-ivory/50">Master switch for push alerts. In-app alerts stay on.</p></div>
          <Toggle checked={!!s.push_enabled} onChange={(v) => save({ push_enabled: v })} label="Alerts on my phone" />
        </div>
      </div>
      <div className="border-t border-ivory/10 pt-4">
        <p className="text-sm text-ivory mb-1">Where you are</p>
        <p className="text-xs text-ivory/50 mb-3">Used only to remind you about in-person events in your city. We never show it to other members.</p>
        <FField label="Country"><CountrySelect value={s.country || ''} onChange={(v) => save({ country: v })} /></FField>
        <FField label="City or town"><input className={inputCls} maxLength={80} value={s.city || ''} onChange={(e) => setS({ ...s, city: e.target.value })} onBlur={() => save({})} placeholder="e.g. Kingston" /></FField>
      </div>
      <div className="border-t border-ivory/10 pt-4">
        <div className="flex items-center gap-3 min-h-[56px]">
          <div className="flex-grow"><p className="text-sm text-ivory">Let other members see that I viewed them</p><p className="text-xs text-ivory/50">If off, a member you view only sees that someone viewed their listing, not who.</p></div>
          <Toggle checked={!!s.share_views} onChange={(v) => save({ share_views: v })} label="Show my name when I view a listing" />
        </div>
      </div>
      {prompt && <PushPromptModal onClose={() => setPrompt(false)} onDone={async () => { setPrompt(false); setPushState(await currentPushState()); }} />}
    </div>
  );
}

/* ---------- Notifications page ---------- */

const NOTIF_ICON = { profile_view: Eye, product_view: Eye, announcement: Megaphone, event_reminder: CalendarClock, system: Bell };

function PushBanner() {
  const [st, setSt] = useState(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => { currentPushState().then(setSt); }, []);
  if (st !== 'off') return null;
  return (
    <div className="mb-4 rounded-2xl border border-gold/30 bg-gold/10 p-4 flex items-center gap-3">
      <BellRing size={20} className="text-gold shrink-0" />
      <p className="text-sm text-ivory/85 flex-grow">Get these alerts on your phone, even when the app is closed.</p>
      <GoldButton onClick={() => setAsk(true)}>Turn on</GoldButton>
      {ask && <PushPromptModal onClose={() => setAsk(false)} onDone={async () => { setAsk(false); setSt(await currentPushState()); }} />}
    </div>
  );
}

function NotificationsPage({ user, tick, onOpenLink, onChanged, onRequireAuth }) {
  const [rows, setRows] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
    setRows(data || []);
  }, [user]);
  useEffect(() => { load(); }, [load, tick]);

  if (!user) {
    return (
      <div className="text-center py-10">
        <EmptyState icon={Bell} title="Sign in to see your notifications" body="Event reminders, announcements and listing views will show up here." />
        <GoldButton onClick={onRequireAuth}><LogIn size={15} /> Sign in</GoldButton>
      </div>
    );
  }
  if (rows === null) return <Spinner />;
  const unread = rows.filter((r) => !r.read_at).length;

  async function markAll() {
    await supabase.rpc('mark_notifications_read', { p_ids: null });
    setRows(rows.map((r) => ({ ...r, read_at: r.read_at || new Date().toISOString() })));
    onChanged();
  }
  async function open(r) {
    if (!r.read_at) {
      await supabase.rpc('mark_notifications_read', { p_ids: [r.id] });
      setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, read_at: new Date().toISOString() } : x)));
      onChanged();
    }
    onOpenLink(r.link);
  }

  return (
    <div>
      <PushBanner />
      <div className="flex items-center justify-between gap-3 mb-4">
        <button type="button" onClick={markAll} disabled={!unread} className="min-h-[44px] inline-flex items-center gap-1.5 text-sm text-gold disabled:text-ivory/30"><CheckCheck size={16} /> Mark all as read</button>
        <button type="button" onClick={() => setShowSettings(true)} className="min-h-[44px] inline-flex items-center gap-1.5 text-sm text-ivory/70 hover:text-ivory"><Settings size={16} /> Settings</button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="You are all caught up" body="Event reminders, announcements and listing views will show up here." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const Icon = NOTIF_ICON[r.type] || Bell;
            return (
              <li key={r.id}>
                <button type="button" onClick={() => open(r)} className={`w-full text-left flex items-start gap-3 rounded-2xl border px-4 py-3.5 min-h-[64px] active:scale-[0.99] transition ${r.read_at ? 'bg-surface border-ivory/[0.07]' : 'bg-gold/10 border-gold/30'}`}>
                  <span className={`mt-0.5 w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${r.read_at ? 'bg-ivory/10 text-ivory/60' : 'bg-gold/20 text-gold'}`}><Icon size={18} /></span>
                  <span className="flex-grow min-w-0">
                    <span className={`block text-sm ${r.read_at ? 'text-ivory/85' : 'text-ivory font-semibold'}`}>{r.title}</span>
                    {r.body && <span className="block text-xs text-ivory/60 mt-0.5">{r.body}</span>}
                    {r.link && r.link.startsWith('chat:') && <span className="inline-flex items-center gap-1.5 mt-2 min-h-[36px] px-3.5 rounded-full bg-gold text-navy text-xs font-semibold"><MessageCircle size={13} /> Open chat</span>}
                    <span className="block text-[11px] text-ivory/45 mt-1">{timeAgo(r.created_at)}</span>
                  </span>
                  {!r.read_at && <span className="mt-2 w-2.5 h-2.5 rounded-full bg-gold shrink-0" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showSettings && <FormModal title="Notification settings" onClose={() => setShowSettings(false)}><NotificationSettings user={user} /></FormModal>}
    </div>
  );
}

/* ---------- Dashboard ---------- */

function Dashboard({ user, profile, status, isApproved, isPaid, betaActive, betaDaysLeft, onGo, onOpenLink, onRequireAuth, onApply, onUpgrade, onAllowPush, showPushCard, onDismissPushCard }) {
  const [events, setEvents] = useState(null);
  const [feed, setFeed] = useState(null);
  const [ads, setAds] = useState([]);
  const [banner, setBanner] = useState(null);
  const [going, setGoing] = useState(new Set());
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [ev, rs, bn, sk, ad, an] = await Promise.all([
        supabase.from('events').select('*').eq('is_active', true).eq('review_status', 'approved').gte('event_date', new Date().toISOString()).order('event_date', { ascending: true }).limit(3),
        supabase.from('resources').select('id,title,category,created_at').eq('is_active', true).eq('review_status', 'approved').eq('resource_type', 'free').order('created_at', { ascending: false }).limit(4),
        supabase.from('benefits').select('id,company_name,discount_text,created_at').eq('is_active', true).order('created_at', { ascending: false }).limit(4),
        supabase.from('skill_offers').select('id,skill,created_at,profiles(full_name,business_name)').order('created_at', { ascending: false }).limit(4),
        supabase.from('ads').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }).limit(4),
        user ? supabase.from('announcements').select('*').eq('show_banner', true).order('created_at', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      ]);
      if (!live) return;
      setEvents(ev.data || []);
      const items = [
        ...(rs.data || []).map((r) => ({ key: `r${r.id}`, icon: FileText, label: 'Resource', text: r.title, at: r.created_at, link: 'tab:resources' })),
        ...(bn.data || []).map((b) => ({ key: `b${b.id}`, icon: Gift, label: 'Benefit', text: `${b.company_name}${b.discount_text ? `: ${b.discount_text}` : ''}`, at: b.created_at, link: 'tab:benefits' })),
        ...(sk.data || []).map((s) => ({ key: `s${s.id}`, icon: Users, label: 'Skills Swap', text: `${s.profiles?.full_name || s.profiles?.business_name || 'A member'} offers ${s.skill}`, at: s.created_at, link: 'tab:skillswap' })),
      ].sort((a, b) => new Date(b.at) - new Date(a.at));
      setFeed(items);
      setAds((ad.data || []).filter((a) => a.is_active !== false));
      const a0 = (an.data || [])[0];
      if (a0 && (!a0.banner_until || new Date(a0.banner_until) > new Date())) {
        let dismissed = false;
        try { dismissed = localStorage.getItem(`tbja_ann_${a0.id}`) === '1'; } catch { /* ignore */ }
        if (!dismissed) setBanner(a0);
      }
      if (user) {
        const { data: rv } = await supabase.from('event_rsvps').select('event_id').eq('user_id', user.id);
        if (live) setGoing(new Set((rv || []).map((x) => x.event_id)));
      }
    })();
    return () => { live = false; };
  }, [user]);

  async function rsvp(id) {
    if (!user) return onRequireAuth();
    setBusyId(id);
    await supabase.from('event_rsvps').insert({ event_id: id, user_id: user.id });
    setGoing((g) => new Set([...g, id]));
    setBusyId(null);
  }

  function openAd(ad) {
    if (!ad.isHouse) supabase.rpc('ad_click', { p_id: ad.id }).then(() => {}, () => {});
    onOpenLink(ad.link_type === 'external' ? ad.link_target : ad.link_target);
  }
  function dismissBanner() {
    try { localStorage.setItem(`tbja_ann_${banner.id}`, '1'); } catch { /* ignore */ }
    setBanner(null);
  }

  const name = firstNameOf(profile, user);
  const tiles = [
    ['directory', 'Directory', Building2], ['resources', 'Resources', FileText], ['skillswap', 'Skills Swap', Users],
    ['benefits', 'Benefits', Gift], ['jobs', 'Jobs', Briefcase], ['shop', 'Shop', ShoppingBag],
  ];
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = (feed || []).filter((f) => new Date(f.at).getTime() >= weekAgo);
  const feedShown = (recent.length ? recent : feed || []).slice(0, 5);
  const feedTitle = recent.length ? 'New this week' : 'Latest';

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-2xl bg-gold/15 border border-gold/40 px-4 py-3 flex items-start gap-3" role="status">
          <Megaphone size={18} className="text-gold mt-0.5 shrink-0" />
          <div className="flex-grow min-w-0">
            <p className="text-sm font-semibold text-ivory">{banner.title}</p>
            {banner.body && <p className="text-xs text-ivory/75 mt-0.5">{banner.body}</p>}
            {banner.link && <button type="button" onClick={() => onOpenLink(banner.link)} className="min-h-[44px] text-xs font-semibold text-gold underline underline-offset-2">Open</button>}
          </div>
          <button type="button" onClick={dismissBanner} aria-label="Dismiss announcement" className="w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-ivory/60"><X size={16} /></button>
        </div>
      )}

      <AdCarousel ads={ads.length ? ads : HOUSE_ADS} onOpen={openAd} />

      <section>
        <h2 className="font-display text-2xl text-ivory">{user ? `Hello${name ? ` ${name}` : ''}` : 'Welcome'}</h2>
        {!user ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ivory/65">A network supporting women in business.</p>
            <GoldButton onClick={onRequireAuth}><LogIn size={15} /> Sign in or join</GoldButton>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ivory/65">
            {status === 'unconfirmed' && (<><span>You have buyer access.</span><button type="button" onClick={onApply} className="min-h-[44px] text-gold font-semibold underline underline-offset-2">Apply to join</button></>)}
            {status === 'pending' && <span>Your application is being reviewed.</span>}
            {status === 'declined' && <span>Your application was not approved.</span>}
            {isApproved && betaActive && <span className="inline-flex items-center gap-1.5 text-gold"><Crown size={14} /> Beta member, {betaDaysLeft} {betaDaysLeft === 1 ? 'day' : 'days'} left</span>}
            {isApproved && !betaActive && isPaid && <span className="inline-flex items-center gap-1.5 text-gold"><Crown size={14} /> Member</span>}
            {isApproved && !isPaid && !IS_NATIVE_APP && (<><span>Free member.</span><button type="button" onClick={onUpgrade} className="min-h-[44px] text-gold font-semibold underline underline-offset-2">{profile?.membership_status || profile?.trial_ends_at ? 'Subscribe' : 'Start free trial'}</button></>)}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80">Coming up</h3>
          <button type="button" onClick={() => onGo('events')} className="min-h-[44px] text-xs text-ivory/60 hover:text-ivory inline-flex items-center gap-0.5">All events <ChevronRight size={14} /></button>
        </div>
        <Card className="divide-y divide-ivory/[0.07] overflow-hidden">
          {events === null ? <Spinner /> : events.length === 0 ? (
            <div className="p-4 flex items-center gap-4 opacity-80">
              <span className="w-14 shrink-0 rounded-2xl border border-dashed border-ivory/25 py-2 text-center"><span className="block text-[10px] uppercase tracking-wider text-gold">Nov</span><span className="block font-display text-xl text-ivory leading-none">12</span></span>
              <span className="flex-grow min-w-0">
                <span className="flex items-center gap-2"><span className="text-sm font-semibold text-ivory">Founders Circle meetup</span><SampleTag /></span>
                <span className="block text-xs text-ivory/55 mt-0.5">6:00 PM · Kingston</span>
                <span className="block text-xs text-ivory/55 mt-1">Real events appear here once they are listed. Hosting one? List it from Events.</span>
              </span>
            </div>
          ) : events.map((ev) => {
            const d = new Date(ev.event_date);
            const isGoing = going.has(ev.id);
            return (
              <div key={ev.id} className="p-4 flex items-center gap-4">
                <span className="w-14 shrink-0 rounded-2xl bg-gold/10 border border-gold/25 py-2 text-center">
                  <span className="block text-[10px] uppercase tracking-wider text-gold">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                  <span className="block font-display text-xl text-ivory leading-none">{d.getDate()}</span>
                </span>
                <span className="flex-grow min-w-0">
                  <span className="block text-sm font-semibold text-ivory truncate">{ev.title}</span>
                  <span className="block text-xs text-ivory/60 mt-0.5">{d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{ev.location ? ` · ${ev.location}` : ''}</span>
                </span>
                {ev.event_type === 'ticketed' ? (
                  <button type="button" onClick={() => onGo('events')} className="min-h-[44px] px-4 rounded-full border border-gold/50 text-gold text-xs font-semibold">Details</button>
                ) : (
                  <button type="button" onClick={() => rsvp(ev.id)} disabled={isGoing || busyId === ev.id} className="min-h-[44px] px-4 rounded-full btn-gold text-navy text-xs font-semibold disabled:opacity-60">
                    {busyId === ev.id ? <Loader2 className="animate-spin" size={14} /> : isGoing ? 'Going' : 'RSVP'}
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      <section>
        <div className="grid grid-cols-3 gap-3">
          {tiles.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => onGo(k)} className="bg-surface border border-ivory/[0.07] rounded-2xl min-h-[96px] p-3 flex flex-col items-center justify-center gap-2 text-center active:scale-[0.97] hover:border-gold/40 transition">
              <span className="w-11 h-11 rounded-full bg-gold/10 text-gold flex items-center justify-center"><Icon size={20} /></span>
              <span className="text-xs font-medium text-ivory">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {showPushCard && (
        <section className="rounded-3xl bg-gradient-to-br from-emerald/40 to-surface border border-ivory/[0.08] p-4 flex items-center gap-3">
          <span className="w-11 h-11 shrink-0 rounded-full bg-gold/20 text-gold flex items-center justify-center"><BellRing size={20} /></span>
          <span className="flex-grow min-w-0">
            <span className="block text-sm font-semibold text-ivory">Never miss an event</span>
            <span className="block text-xs text-ivory/65">Get alerts on your phone, even when the app is closed.</span>
          </span>
          <span className="flex flex-col items-end">
            <button type="button" onClick={onAllowPush} className="min-h-[44px] px-4 rounded-full btn-gold text-navy text-xs font-semibold whitespace-nowrap">Turn on</button>
            <button type="button" onClick={onDismissPushCard} className="min-h-[44px] px-2 text-[11px] text-ivory/50">Not now</button>
          </span>
        </section>
      )}

      <section>
        <h3 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2.5">{feedTitle}</h3>
        <Card className="divide-y divide-ivory/[0.07] overflow-hidden">
          {feed === null ? <Spinner /> : feedShown.length === 0 ? (
            <div className="p-4 space-y-3 opacity-80">
              {[[FileText, 'Resource', 'Invoice template for small businesses'], [Gift, 'Benefit', 'Member discount from a partner brand'], [Users, 'Skills Swap', 'A member offers brand photography']].map(([Icon, lbl, txt]) => (
                <div key={lbl} className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-ivory/10 text-ivory/60 flex items-center justify-center"><Icon size={16} /></span>
                  <span className="flex-grow min-w-0"><span className="block text-[11px] text-ivory/45">{lbl}</span><span className="block text-sm text-ivory/80 truncate">{txt}</span></span>
                  <SampleTag />
                </div>
              ))}
              <p className="text-xs text-ivory/55">New resources, benefits and skill swap posts will show here.</p>
            </div>
          ) : feedShown.map((f) => (
            <button key={f.key} type="button" onClick={() => onOpenLink(f.link)} className="w-full text-left p-4 min-h-[64px] flex items-center gap-3 active:bg-ivory/[0.04]">
              <span className="w-9 h-9 shrink-0 rounded-full bg-gold/10 text-gold flex items-center justify-center"><f.icon size={16} /></span>
              <span className="flex-grow min-w-0"><span className="block text-[11px] text-ivory/45">{f.label} · {timeAgo(f.at)}</span><span className="block text-sm text-ivory truncate">{f.text}</span></span>
              <ChevronRight size={16} className="text-ivory/30 shrink-0" />
            </button>
          ))}
        </Card>
      </section>
    </div>
  );
}

/* ---------- Benefits and Jobs ---------- */

const BENEFIT_REDEMPTION = [['code', 'Promo code'], ['link', 'Website link'], ['show_screen', 'Show this screen']];

function BenefitForm({ onClose, onSaved }) {
  const [f, setF] = useState({ company_name: '', category: '', description: '', discount_text: '', redemption_type: 'link', code: '', website_url: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const row = { ...f, code: f.code || null, website_url: f.website_url || null, category: f.category || null, is_active: true };
    const { error } = await supabase.from('benefits').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  }
  return (
    <FormModal title="Add a benefit" onClose={onClose}>
      <form onSubmit={submit}>
        <FField label="Company" required><input className={inputCls} required value={f.company_name} onChange={set('company_name')} /></FField>
        <FField label="Offer, short" required><input className={inputCls} required value={f.discount_text} onChange={set('discount_text')} placeholder="15% off your first order" /></FField>
        <FField label="Details" required><textarea className={inputCls} rows={3} required value={f.description} onChange={set('description')} /></FField>
        <FField label="Category"><input className={inputCls} value={f.category} onChange={set('category')} /></FField>
        <FField label="How members use it"><select className={inputCls} value={f.redemption_type} onChange={set('redemption_type')}>{BENEFIT_REDEMPTION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FField>
        <FField label="Promo code (if any)"><input className={inputCls} value={f.code} onChange={set('code')} /></FField>
        <FField label="Website (https://...)"><input className={inputCls} value={f.website_url} onChange={set('website_url')} /></FField>
        {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
        <GoldButton type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Save benefit'}</GoldButton>
      </form>
    </FormModal>
  );
}

function BenefitsTab({ user, onRequireAuth, isAdmin }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(() => {
    // Promo codes are only requested when signed in; the database refuses them to anyone else.
    const cols = 'id,company_name,category,description,discount_text,redemption_type,website_url,logo_url,is_active,created_at' + (user ? ',code' : '');
    supabase.from('benefits').select(cols).eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => setRows(data || []));
  }, [user]);
  useEffect(() => { load(); }, [load]);
  if (rows === null) return <Spinner />;
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ivory/60">Member discounts and perks from partner businesses.</p>
        {isAdmin && <GoldButton onClick={() => setAdding(true)}><Plus size={15} /> Add</GoldButton>}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Gift} title="Benefits are coming soon" body="Partner discounts and perks will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((b) => (
            <Card key={b.id} className="p-5 flex flex-col">
              <SectionLabel>{b.category || 'Benefit'}</SectionLabel>
              <h3 className="font-semibold text-lg text-ivory">{b.company_name}</h3>
              {b.discount_text && <p className="text-sm font-semibold text-mint mt-0.5">{b.discount_text}</p>}
              {b.description && <p className="text-sm text-ivory/75 mt-2 mb-4 flex-grow">{b.description}</p>}
              <div className="flex flex-wrap items-center gap-3 mt-auto">
                {(user ? b.code : b.redemption_type === 'code') && (user ? (
                  <button type="button" onClick={() => setOpenId(openId === b.id ? null : b.id)} className="min-h-[44px] px-4 rounded-full border border-gold/50 text-gold text-xs font-semibold">{openId === b.id ? b.code : 'Show code'}</button>
                ) : <button type="button" onClick={onRequireAuth} className="min-h-[44px] px-4 rounded-full border border-gold/50 text-gold text-xs font-semibold">Sign in to see code</button>)}
                {b.website_url && /^https?:\/\//i.test(b.website_url) && <GoldButton href={b.website_url}>Visit <ExternalLink size={13} /></GoldButton>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {adding && <BenefitForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function JobForm({ onClose, onSaved }) {
  const [f, setF] = useState({ title: '', company: '', location: '', category: '', description: '', external_url: '', source_board: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const row = { ...f, category: f.category || null, location: f.location || null, description: f.description || null, source_board: f.source_board || null, is_active: true };
    const { error } = await supabase.from('jobs').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  }
  return (
    <FormModal title="Add a job" onClose={onClose}>
      <form onSubmit={submit}>
        <FField label="Job title" required><input className={inputCls} required value={f.title} onChange={set('title')} /></FField>
        <FField label="Company" required><input className={inputCls} required value={f.company} onChange={set('company')} /></FField>
        <FField label="Location"><input className={inputCls} maxLength={200} value={f.location} onChange={set('location')} placeholder="Kingston, or Remote" /></FField>
        <FField label="Category"><input className={inputCls} value={f.category} onChange={set('category')} /></FField>
        <FField label="Short description"><textarea className={inputCls} rows={3} value={f.description} onChange={set('description')} /></FField>
        <FField label="Apply link (https://...)" required><input className={inputCls} required value={f.external_url} onChange={set('external_url')} /></FField>
        {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
        <GoldButton type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Save job'}</GoldButton>
      </form>
    </FormModal>
  );
}

function JobsTab({ isAdmin }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    supabase.from('jobs').select('*').eq('is_active', true).order('created_at', { ascending: false }).then(({ data }) => setRows(data || []));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (rows === null) return <Spinner />;
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ivory/60">Roles and opportunities. Applying happens on the employer's own site.</p>
        {isAdmin && <GoldButton onClick={() => setAdding(true)}><Plus size={15} /> Add</GoldButton>}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="Jobs are coming soon" body="Roles and opportunities will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((j) => (
            <Card key={j.id} className="p-5 flex flex-col">
              <SectionLabel>{j.category || 'Job'}</SectionLabel>
              <h3 className="font-semibold text-lg text-ivory">{j.title}</h3>
              <p className="text-sm text-ivory/70">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
              {j.description && <p className="text-sm text-ivory/75 mt-2 mb-4 flex-grow line-clamp-4">{j.description}</p>}
              {j.external_url && /^https?:\/\//i.test(j.external_url) && <div className="mt-auto"><GoldButton href={j.external_url}>Apply <ExternalLink size={13} /></GoldButton></div>}
            </Card>
          ))}
        </div>
      )}
      {adding && <JobForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

/* ---------- Admin tools: announcements and ads ---------- */

function AdminAnnounceModal({ onClose }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkKind, setLinkKind] = useState('none');
  const [linkTab, setLinkTab] = useState('tab:events');
  const [linkUrl, setLinkUrl] = useState('');
  const [banner, setBanner] = useState(true);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null);

  async function send(e) {
    e.preventDefault();
    setErr('');
    const link = linkKind === 'tab' ? linkTab : linkKind === 'url' ? linkUrl.trim() : '';
    if (linkKind === 'url' && !/^https:\/\/.{3,}/.test(link)) return setErr('The web link must start with https://');
    if (!window.confirm('Send this to every member now? It cannot be unsent.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_send_announcement', { p_title: title, p_body: body, p_link: link, p_banner: banner, p_banner_days: Number(days) || 7 });
    setBusy(false);
    if (error) return setErr(error.message);
    setSent(data);
  }
  return (
    <FormModal title="Send an announcement" onClose={onClose}>
      {sent !== null ? (
        <div>
          <p className="text-sm text-ivory/85 mb-4">Sent to {sent} {sent === 1 ? 'member' : 'members'}. It shows in their notifications and as a phone alert if they turned those on.</p>
          <GoldButton onClick={onClose}>Done</GoldButton>
        </div>
      ) : (
        <form onSubmit={send}>
          <FField label="Headline (80 characters)" required><input className={inputCls} required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></FField>
          <FField label="Message (300 characters)"><textarea className={inputCls} rows={3} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} /></FField>
          <FField label="Where should it take them?">
            <select className={inputCls} value={linkKind} onChange={(e) => setLinkKind(e.target.value)}>
              <option value="none">Nowhere</option><option value="tab">A page in the app</option><option value="url">A website</option>
            </select>
          </FField>
          {linkKind === 'tab' && <FField label="Page"><select className={inputCls} value={linkTab} onChange={(e) => setLinkTab(e.target.value)}>{SECTION_LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FField>}
          {linkKind === 'url' && <FField label="Website (https://...)"><input className={inputCls} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></FField>}
          <label className="flex items-center gap-3 min-h-[44px] text-sm text-ivory/85 mb-2"><input type="checkbox" checked={banner} onChange={(e) => setBanner(e.target.checked)} className="w-5 h-5 accent-[#D4A33A]" /> Also show as a banner on the dashboard</label>
          {banner && <FField label="Banner stays for (days)"><input type="number" min={1} max={60} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></FField>}
          {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
          <GoldButton type="submit" disabled={busy || !title.trim()}>{busy ? <Loader2 className="animate-spin" size={16} /> : <><Send size={14} /> Send to all members</>}</GoldButton>
        </form>
      )}
    </FormModal>
  );
}

function AdminAdsModal({ onClose }) {
  const [adImg, setAdImg] = useState(null);
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ title: '', subtitle: '', image_url: '', link_type: 'external', link_target: '', sort_order: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('ads').select('*').order('is_active', { ascending: false }).order('sort_order', { ascending: true });
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function add(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    let imageUrl = null;
    if (adImg) {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[adImg.type];
      const { data: au } = await supabase.auth.getUser();
      if (!ext || adImg.size > 2 * 1024 * 1024 || !au?.user) { setBusy(false); return setErr('Please choose a JPG, PNG or WebP picture under 2 MB.'); }
      const path = `${au.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('product-images').upload(path, adImg, { contentType: adImg.type });
      if (up.error) { setBusy(false); return setErr('Could not upload the picture.'); }
      imageUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const row = { title: f.title.trim(), subtitle: f.subtitle.trim() || null, image_url: imageUrl, link_type: f.link_type, link_target: f.link_target.trim(), sort_order: Number(f.sort_order) || 0, is_active: true };
    const { error } = await supabase.from('ads').insert(row);
    setBusy(false);
    if (error) return setErr(/ads_target_ok/.test(error.message) ? 'The link must be a website starting with https://, or a page in the app.' : error.message);
    setF({ title: '', subtitle: '', image_url: '', link_type: 'external', link_target: '', sort_order: 0 });
    setAdImg(null);
    load();
  }
  async function toggle(r) {
    await supabase.from('ads').update({ is_active: !r.is_active }).eq('id', r.id);
    load();
  }
  const activeCount = (rows || []).filter((r) => r.is_active).length;
  return (
    <FormModal title="Dashboard ads" onClose={onClose}>
      <p className="text-xs text-ivory/60 mb-4">The dashboard rotates up to 4 active ads, lowest order number first. With none active, it shows The Boardroom's own promotions. Ads are labelled "Ad" for members.</p>
      {rows === null ? <Spinner /> : (
        <div className="space-y-2 mb-6">
          {rows.length === 0 && <p className="text-sm text-ivory/50">No ads yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className={`rounded-2xl bg-navy/50 p-3.5 text-sm ${r.is_active ? '' : 'opacity-60'}`}>
              <p className="font-semibold text-ivory">{r.title}</p>
              <p className="text-xs text-ivory/55 break-all">{r.link_type === 'internal' ? `Page: ${r.link_target.replace('tab:', '')}` : r.link_target}</p>
              <p className="text-xs text-ivory/45 mt-0.5">Order {r.sort_order} · {r.click_count} {r.click_count === 1 ? 'click' : 'clicks'}</p>
              <button type="button" onClick={() => toggle(r)} className="min-h-[44px] text-xs text-gold underline underline-offset-2">{r.is_active ? 'Switch off' : 'Switch on'}</button>
            </div>
          ))}
        </div>
      )}
      <h4 className="text-xs font-medium tracking-[0.14em] uppercase text-gold/80 mb-2">Add an ad</h4>
      {activeCount >= 4 && <p className="text-xs text-ivory/60 mb-2">You already have 4 active. Switch one off for a new one to show.</p>}
      <form onSubmit={add}>
        <FField label="Headline" required><input className={inputCls} required maxLength={70} value={f.title} onChange={set('title')} /></FField>
        <FField label="One line of detail"><input className={inputCls} maxLength={120} value={f.subtitle} onChange={set('subtitle')} /></FField>
        <FField label="Picture (optional, JPG, PNG or WebP, under 2 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAdImg(e.target.files?.[0] || null)} className="block w-full text-sm text-ivory/70 file:mr-3 file:min-h-[44px] file:px-4 file:rounded-full file:border-0 file:bg-gold file:text-navy file:font-semibold" /></FField>
        <FField label="Where it goes">
          <select className={inputCls} value={f.link_type} onChange={(e) => setF({ ...f, link_type: e.target.value, link_target: '' })}>
            <option value="external">Another website</option><option value="internal">A page in the app</option>
          </select>
        </FField>
        {f.link_type === 'external' ? (
          <FField label="Website (https://...)" required><input className={inputCls} required value={f.link_target} onChange={set('link_target')} /></FField>
        ) : (
          <FField label="Page" required><select className={inputCls} required value={f.link_target} onChange={set('link_target')}><option value="">Choose…</option>{SECTION_LINKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FField>
        )}
        <FField label="Order (1 shows first)"><input type="number" className={inputCls} value={f.sort_order} onChange={set('sort_order')} /></FField>
        {err && <p className="text-[#F2B8C2] bg-wine/60 border border-wine rounded-xl px-3 py-2 text-xs mb-3">{err}</p>}
        <GoldButton type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" size={16} /> : 'Add ad'}</GoldButton>
      </form>
    </FormModal>
  );
}

function AdminTab() {
  const [panel, setPanel] = useState(null);
  const items = [
    ['members', 'Review applications', 'Approve, decline, or give a 14 day beta trial.', ShieldCheck],
    ['announce', 'Send an announcement', 'Notify every member, with an optional dashboard banner.', Megaphone],
    ['ads', 'Dashboard ads', 'Add up to 4 rotating ads that link to a site or a page.', Tag],
  ];
  return (
    <div className="space-y-3">
      {items.map(([k, t, d, Icon]) => (
        <button key={k} type="button" onClick={() => setPanel(k)} className="w-full text-left bg-surface border border-ivory/[0.07] rounded-2xl p-4 min-h-[72px] flex items-center gap-4 active:scale-[0.99]">
          <span className="w-11 h-11 shrink-0 rounded-full bg-gold/10 text-gold flex items-center justify-center"><Icon size={20} /></span>
          <span className="flex-grow"><span className="block text-sm font-semibold text-ivory">{t}</span><span className="block text-xs text-ivory/55">{d}</span></span>
          <ChevronRight size={16} className="text-ivory/30" />
        </button>
      ))}
      <p className="text-xs text-ivory/45 pt-2">Benefits and Jobs: open those pages and use the Add button.</p>
      {panel === 'members' && <AdminMembersModal onClose={() => setPanel(null)} />}
      {panel === 'announce' && <AdminAnnounceModal onClose={() => setPanel(null)} />}
      {panel === 'ads' && <AdminAdsModal onClose={() => setPanel(null)} />}
    </div>
  );
}

/* ---------- Slide-out menu ---------- */

function Drawer({ open, onClose, tab, onGo, user, profile, unread, isAdmin, onAccount, onSignOut, onSignIn, onLegal }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const items = [
    ['home', 'Dashboard', Home], ['directory', 'Directory', Building2], ['events', 'Events', Calendar], ['skillswap', 'Skills Swap', Users],
    ['shop', 'Shop', ShoppingBag], ['resources', 'Resources', FileText], ['benefits', 'Benefits', Gift], ['jobs', 'Jobs', Briefcase],
    ['messages', 'Messages', Inbox], ['notifications', 'Notifications', Bell],
  ];
  if (isAdmin) items.push(['admin', 'Admin', ShieldCheck]);
  const row = 'w-full flex items-center gap-4 px-5 min-h-[52px] text-left text-[15px]';
  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside role="dialog" aria-label="Menu" className={`absolute inset-y-0 left-0 w-[84%] max-w-[320px] bg-surface border-r border-ivory/10 flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between pl-5 pr-2 pt-safe h-16 shrink-0 border-b border-ivory/[0.07]">
          <Logo className="h-9" />
          <button type="button" onClick={onClose} aria-label="Close menu" className="w-11 h-11 flex items-center justify-center text-ivory/70"><X size={20} /></button>
        </div>
        {user && (
          <div className="px-5 py-4 flex items-center gap-3 border-b border-ivory/[0.07]">
            <Avatar profile={profile} user={user} size={44} />
            <div className="min-w-0"><p className="text-sm font-semibold text-ivory truncate">{firstNameOf(profile, user) || 'Member'}</p><p className="text-xs text-ivory/50 truncate">{user.email}</p></div>
          </div>
        )}
        <nav className="flex-grow overflow-y-auto py-2">
          {items.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => onGo(k)} className={`${row} ${tab === k ? 'text-gold bg-gold/10' : 'text-ivory/85 active:bg-ivory/[0.05]'}`}>
              <Icon size={20} strokeWidth={tab === k ? 2.2 : 1.7} /> <span className="flex-grow">{label}</span>
              {k === 'notifications' && unread > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose text-white text-[11px] font-semibold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-ivory/[0.07] py-2 pb-safe">
          {user ? (
            <>
              <button type="button" onClick={onAccount} className={`${row} text-ivory/85`}><User size={20} strokeWidth={1.7} /> My account</button>
              <button type="button" onClick={onSignOut} className={`${row} text-ivory/85`}><LogOut size={20} strokeWidth={1.7} /> Sign out</button>
            </>
          ) : (
            <button type="button" onClick={onSignIn} className={`${row} text-gold`}><LogIn size={20} /> Sign in</button>
          )}
          <div className="flex gap-5 px-5 pt-1 text-xs text-ivory/50">
            <button type="button" onClick={() => onLegal('privacy')} className="min-h-[44px] underline underline-offset-2">Privacy Policy</button>
            <button type="button" onClick={() => onLegal('terms')} className="min-h-[44px] underline underline-offset-2">Terms of Use</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Directory listing detail (records a "view") ---------- */

function ListingModal({ biz, user, canMessage, onMessage, onClose }) {
  useEffect(() => {
    if (user && biz.user_id !== user.id) supabase.rpc('record_view', { p_type: 'listing', p_id: biz.id }).then(() => {}, () => {});
  }, [biz.id, biz.user_id, user]);
  return (
    <FormModal title={biz.business_name} onClose={onClose}>
      <SectionLabel>{biz.category}</SectionLabel>
      <p className="text-xs text-ivory/55 mb-3 flex items-center gap-1"><MapPin size={12} /> {[biz.parish, biz.country].filter(Boolean).join(', ')}</p>
      {biz.review_count > 0 && <div className="mb-3 flex items-center gap-2"><StarRating value={biz.avg_rating} count={biz.review_count} /></div>}
      <p className="text-sm text-ivory/80 whitespace-pre-line mb-4">{biz.description}</p>
      <div className="flex flex-wrap items-center gap-3">
        {biz.website_url && (
          <a href={biz.website_url.startsWith('http') ? biz.website_url : `https://${biz.website_url}`} target="_blank" rel="noopener noreferrer" className="min-h-[44px] inline-flex items-center gap-1 text-sm text-mint hover:underline">Website <ExternalLink size={12} /></a>
        )}
        {canMessage && <GoldButton onClick={onMessage}><MessageCircle size={14} /> Message</GoldButton>}
      </div>
    </FormModal>
  );
}

/* ---------------------------------------------------------
   Root App
--------------------------------------------------------- */

const TABS = [
  { key: 'home', label: 'Dashboard', short: 'Home', icon: Home },
  { key: 'directory', label: 'Directory', short: 'Directory', icon: Building2, Comp: DirectoryTab },
  { key: 'events', label: 'Events', short: 'Events', icon: Calendar, Comp: EventsTab },
  { key: 'skillswap', label: 'Skills Swap', short: 'Skills', icon: Users, Comp: SkillswapTab },
  { key: 'shop', label: 'Shop', short: 'Shop', icon: ShoppingBag, Comp: ShopTab },
  { key: 'resources', label: 'Resources', short: 'Resources', icon: FileText, Comp: ResourcesTab },
  { key: 'benefits', label: 'Benefits', short: 'Benefits', icon: Gift, Comp: BenefitsTab },
  { key: 'jobs', label: 'Jobs', short: 'Jobs', icon: Briefcase, Comp: JobsTab },
  { key: 'messages', label: 'Messages', short: 'Chat', icon: Inbox, Comp: MessagesTab },
  { key: 'notifications', label: 'Notifications', short: 'Alerts', icon: Bell },
  { key: 'admin', label: 'Admin', short: 'Admin', icon: ShieldCheck },
];
const TAB_KEYS = TABS.map((t) => t.key);
const DESKTOP_NAV = ['home', 'directory', 'events', 'skillswap', 'shop', 'resources', 'benefits', 'jobs', 'messages'];
const BOTTOM_NAV = ['home', 'events', 'shop', 'resources', 'messages'];

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('home');
  const [showAuth, setShowAuth] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [membershipNotice, setMembershipNotice] = useState(null); // 'success' | 'cancelled' | null
  const [orderNotice, setOrderNotice] = useState(null); // 'success' | 'cancelled' | null
  const [connectReturn, setConnectReturn] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [rootLegal, setRootLegal] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifTick, setNotifTick] = useState(0);
  const [thread, setThread] = useState(null);
  const [pushPrompt, setPushPrompt] = useState(false);
  const [pushCard, setPushCard] = useState(false);
  const tabRef = useRef('home');
  const pendingLink = useRef(null);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  useEffect(() => {
    // Keep the same user object when only the token refreshes, so nothing reloads or flickers.
    const keep = (u) => setUser((cur) => (cur && u && cur.id === u.id ? cur : u));
    supabase.auth.getSession().then(({ data }) => keep(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      keep(session?.user ?? null);
    });
    // Stay signed in: when the app comes back to the front (phone unlocked, tab reopened), make sure the session is fresh.
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.auth.getSession().then(({ data }) => {
        const exp = data.session?.expires_at;
        if (data.session && exp && exp * 1000 - Date.now() < 5 * 60 * 1000) supabase.auth.refreshSession();
      });
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => { sub.subscription.unsubscribe(); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
  }, []);

  const loadProfile = useCallback(() => {
    if (!user) { setProfile(null); return; }
    supabase.rpc('my_profile')
      .then(({ data, error }) => {
        const row = Array.isArray(data) ? data[0] : data;
        // On a network hiccup keep what we already know instead of treating the member as new.
        setProfile((cur) => row || (error && cur) || { member_status: 'unconfirmed' });
      });
  }, [user]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  /* ----- Navigation: Back always returns to the Dashboard ----- */
  const goTab = useCallback((key) => {
    if (!TAB_KEYS.includes(key)) return;
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
    if (key === 'home') {
      if (window.history.state?.tbja) window.history.back(); else setTab('home');
      return;
    }
    if (tabRef.current === 'home') window.history.pushState({ tbja: key }, ''); else window.history.replaceState({ tbja: key }, '');
    setTab(key);
  }, []);
  useEffect(() => {
    const onPop = () => { setDrawerOpen(false); setTab('home'); window.scrollTo({ top: 0 }); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
      goTab('shop');
      params.delete('order');
    }
    const connectResult = params.get('connect');
    if (connectResult === 'return' || connectResult === 'refresh') {
      setConnectReturn(true);
      goTab('shop');
      params.delete('connect');
    }
    const openParam = params.get('open');
    if (openParam) { params.delete('open'); pendingLink.current = openParam; }
    if (result || orderResult || connectResult || openParam) {
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [flowOpen, setFlowOpen] = useState(false);
  const status = user ? (profile ? (profile.member_status || 'unconfirmed') : null) : 'unconfirmed';
  const isApproved = status === 'approved';
  const isAdmin = !!profile?.is_admin;
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

  /* ----- Notifications: unread badge, live updates, timezone ----- */
  const refreshUnread = useCallback(() => {
    if (!user) { setUnread(0); return; }
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      .then(({ count }) => setUnread(count || 0));
  }, [user]);
  useEffect(() => {
    refreshUnread();
    if (!user) return undefined;
    const ch = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { refreshUnread(); setNotifTick((t) => t + 1); })
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') { refreshUnread(); setNotifTick((t) => t + 1); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch); };
  }, [user, refreshUnread]);

  // Keep the member's timezone up to date so event reminders arrive at a sensible local time.
  useEffect(() => {
    if (!user) return;
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
    if (!tz) return;
    supabase.from('notification_settings').select('user_id, timezone').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) supabase.from('notification_settings').insert({ user_id: user.id, timezone: tz }).then(() => {}, () => {});
        else if (data.timezone !== tz) supabase.from('notification_settings').update({ timezone: tz }).eq('user_id', user.id).then(() => {}, () => {});
      });
  }, [user]);

  // Friendly push card: only from the second visit on, never on first load.
  useEffect(() => {
    if (!user) { setPushCard(false); return; }
    let visits = 0; let dismissed = false;
    try {
      const k = `tbja_visits_${user.id}`;
      if (!sessionStorage.getItem(`${k}_s`)) { visits = Number(localStorage.getItem(k) || 0) + 1; localStorage.setItem(k, String(visits)); sessionStorage.setItem(`${k}_s`, '1'); } else visits = Number(localStorage.getItem(k) || 0);
      dismissed = localStorage.getItem(`tbja_pushno_${user.id}`) === '1';
    } catch { /* ignore */ }
    if (dismissed || visits < 2 || IS_NATIVE_APP) return;
    currentPushState().then((s) => { if (s === 'off' && (pushSupported() && (!isIOS() || isInstalledApp()))) setPushCard(true); });
  }, [user]);

  /* ----- Links from notifications, ads and push taps ----- */
  const openChat = useCallback(async (otherId) => {
    if (!user) return setShowAuth(true);
    const { data } = await supabase.from('business_directory').select('business_name').eq('user_id', otherId).maybeSingle();
    setThread({ otherUserId: otherId, otherName: data?.business_name || 'this member' });
  }, [user]);
  const openLink = useCallback((link) => {
    if (!link) return;
    if (link.startsWith('tab:')) {
      const k = link.slice(4);
      if (k === 'admin' && !isAdmin) return;
      goTab(k);
    } else if (link.startsWith('chat:')) openChat(link.slice(5));
    else if (/^https:\/\//.test(link)) window.open(link, '_blank', 'noopener,noreferrer');
  }, [goTab, openChat, isAdmin]);
  useEffect(() => {
    if (pendingLink.current && user && profile) { const l = pendingLink.current; pendingLink.current = null; openLink(l); }
  }, [user, profile, openLink]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => { if (e.data?.type === 'open-link') openLink(e.data.link); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [openLink]);

  const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const betaActive = !!trialEnd && trialEnd > new Date() && profile?.membership_tier !== 'paid';
  const betaDaysLeft = betaActive ? Math.max(1, Math.ceil((trialEnd - new Date()) / 86400000)) : 0;
  const isPaid = profile?.membership_tier === 'paid' || betaActive;
  const active = TABS.find((t) => t.key === (tab === 'admin' && !isAdmin ? 'home' : tab)) || TABS[0];
  const ActiveComp = active.Comp;
  const onHome = active.key === 'home';
  const common = { user, onRequireAuth: () => setShowAuth(true), openPanel: connectReturn, isPaid, onUpgrade: handleUpgradeClick, isApproved, status, onApply: handleApply, isAdmin };
  const dismissPushCard = () => { try { localStorage.setItem(`tbja_pushno_${user.id}`, '1'); } catch { /* ignore */ } setPushCard(false); };

  const statusChips = (
    <>
      {user && status === 'unconfirmed' && (
        <button onClick={handleApply} className="flex items-center gap-1.5 text-xs font-semibold text-navy btn-gold rounded-full px-3.5 min-h-[36px] hover:brightness-110">
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
            className="flex items-center gap-1.5 text-xs font-semibold text-navy btn-gold rounded-full px-3.5 min-h-[36px] hover:brightness-110 disabled:opacity-50"
          >
            {upgrading ? <Loader2 className="animate-spin" size={13} /> : <Crown size={13} />} {profile?.membership_status || profile?.trial_ends_at ? 'Subscribe' : 'Start free trial'}
          </button>
        )
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-navy font-sans text-ivory">
      {/* App bar */}
      <header className="bg-navy/90 backdrop-blur sticky top-0 z-40 border-b border-ivory/[0.07] pt-safe">
        <div className="max-w-5xl mx-auto px-2 md:px-4 h-14 md:h-16 flex items-center gap-1 md:gap-3">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="xl:hidden w-11 h-11 flex items-center justify-center text-ivory/90 active:bg-ivory/10 rounded-full shrink-0">
            <Menu size={22} />
          </button>
          {!onHome && (
            <button type="button" onClick={() => goTab('home')} aria-label="Back to dashboard" className="xl:hidden w-11 h-11 flex items-center justify-center text-ivory/90 active:bg-ivory/10 rounded-full shrink-0 -ml-1">
              <ArrowLeft size={20} />
            </button>
          )}
          <button type="button" onClick={() => goTab('home')} aria-label="Dashboard" className={`shrink-0 min-h-[44px] ${onHome ? '' : 'hidden xl:block'}`}><Logo className="h-9 md:h-11" /></button>
          {!onHome && <h1 className="xl:hidden font-display text-lg text-ivory truncate">{active.label}</h1>}
          <nav className="hidden xl:flex items-center gap-1 bg-surface rounded-full p-1 border border-ivory/[0.07] mx-auto">
            {DESKTOP_NAV.map((k) => {
              const t = TABS.find((x) => x.key === k);
              return (
                <button
                  key={k}
                  onClick={() => goTab(k)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${tab === k ? 'bg-gold text-navy' : 'text-ivory/70 hover:text-ivory'}`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="flex-grow xl:hidden" />
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <span className="hidden md:flex items-center gap-2">{statusChips}</span>
            {user && (
              <button type="button" onClick={() => goTab('notifications')} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative w-11 h-11 flex items-center justify-center text-ivory/90 active:bg-ivory/10 rounded-full">
                <Bell size={21} />
                {unread > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-white text-[10px] font-bold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
              </button>
            )}
            {user && (
              <button type="button" onClick={() => setShowAccount(true)} aria-label="My account" className="w-11 h-11 flex items-center justify-center rounded-full active:opacity-80">
                <Avatar profile={profile} user={user} size={34} />
              </button>
            )}
            {user && isAdmin && (
              <button type="button" onClick={() => goTab('admin')} aria-label="Admin" className="hidden md:flex w-11 h-11 items-center justify-center text-ivory/70 hover:text-gold"><ShieldCheck size={19} /></button>
            )}
            {user && (
              <button type="button" onClick={() => supabase.auth.signOut()} aria-label="Sign out" className="hidden md:flex w-11 h-11 items-center justify-center text-ivory/70 hover:text-ivory">
                <LogOut size={16} />
              </button>
            )}
            {user === null && (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-ivory border border-ivory/20 rounded-full px-4 min-h-[40px] hover:border-gold hover:text-gold"
              >
                <LogIn size={15} /> Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Price strip, only until someone is a paying or beta member */}
      {!isPaid && (
        <div className="bg-surface/60 border-b border-ivory/[0.07]">
          <div className="max-w-5xl mx-auto px-4 py-1.5 text-center text-[11px] text-ivory/60">
            Beta: 14 days free, then US$5.99/month. Cancel any time.
          </div>
        </div>
      )}

      {user && profile && !isApproved && !onHome && (
        <div className="bg-gold/10 border-b border-gold/25">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-ivory/85 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            {status === 'pending' && <span>Your application is being reviewed. Messaging, Skillswap, listing and selling open once you are approved.</span>}
            {status === 'declined' && <span>Your application was not approved. You can still browse the Directory and buy from the Shop.</span>}
            {status === 'unconfirmed' && (
              <>
                <span>You have buyer access: browse the Directory and buy from the Shop. The network is for women in business.</span>
                <button onClick={handleApply} className="min-h-[44px] text-gold font-semibold underline underline-offset-2">Apply to join</button>
              </>
            )}
          </div>
        </div>
      )}

      {membershipNotice === 'success' && (
        <div className="bg-gold/20 border-b border-gold/40">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-gold font-medium flex items-center justify-center gap-2">
            <Crown size={13} /> Welcome in. Your membership is active and your free trial has started.
            <button onClick={() => setMembershipNotice(null)} aria-label="Dismiss" className="w-11 h-11 flex items-center justify-center text-gold/70 hover:text-gold"><X size={13} /></button>
          </div>
        </div>
      )}
      {membershipNotice === 'cancelled' && (
        <div className="bg-wine border-b border-wine">
          <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-ivory font-medium flex items-center justify-center gap-2">
            Checkout was cancelled. No payment was taken.
            <button onClick={() => setMembershipNotice(null)} aria-label="Dismiss" className="w-11 h-11 flex items-center justify-center text-ivory/70 hover:text-ivory"><X size={13} /></button>
          </div>
        </div>
      )}

      {orderNotice && (
        <div className={orderNotice === 'success' ? 'bg-gold/20 border-b border-gold/40' : 'bg-wine border-b border-wine'}>
          <div className={`max-w-5xl mx-auto px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 ${orderNotice === 'success' ? 'text-gold' : 'text-ivory'}`}>
            {orderNotice === 'success' ? 'Thank you! Your order is confirmed. Check your email for the receipt. The seller will be in touch to arrange delivery.' : 'Checkout was cancelled. No payment was taken.'}
            <button onClick={() => setOrderNotice(null)} aria-label="Dismiss" className="w-11 h-11 flex items-center justify-center"><X size={13} /></button>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 pt-5 md:pt-8 pb-28 xl:pb-12 overflow-x-hidden">
        {!onHome && <h1 className="hidden xl:block font-display text-3xl text-ivory mb-6">{active.label}</h1>}
        <div key={active.key} className="tbja-page">
          {active.key === 'home' ? (
            <Dashboard
              user={user} profile={profile} status={status} isApproved={isApproved} isPaid={isPaid} betaActive={betaActive} betaDaysLeft={betaDaysLeft}
              onGo={goTab} onOpenLink={openLink} onRequireAuth={() => setShowAuth(true)} onApply={handleApply} onUpgrade={handleUpgradeClick}
              showPushCard={pushCard} onAllowPush={() => setPushPrompt(true)} onDismissPushCard={dismissPushCard}
            />
          ) : active.key === 'notifications' ? (
            <NotificationsPage user={user} tick={notifTick} onOpenLink={openLink} onChanged={refreshUnread} onRequireAuth={() => setShowAuth(true)} />
          ) : active.key === 'admin' ? (
            <AdminTab />
          ) : (
            <ActiveComp {...common} />
          )}
        </div>
      </main>

      <footer className="hidden md:block border-t border-ivory/[0.07] py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-ivory/40">
          The Boardroom. Build the table. Don't wait for a seat.
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav aria-label="Main" className="xl:hidden fixed bottom-0 inset-x-0 z-40 bg-navy/95 backdrop-blur border-t border-ivory/[0.08] pb-safe">
        <div className="grid grid-cols-5">
          {BOTTOM_NAV.map((k) => {
            const t = TABS.find((x) => x.key === k);
            const on = tab === k;
            return (
              <button
                key={k}
                onClick={() => goTab(k)}
                aria-current={on ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[58px] text-[11px] font-medium transition-colors ${on ? 'text-gold' : 'text-ivory/55'}`}
              >
                {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" />}
                <t.icon size={22} strokeWidth={on ? 2.1 : 1.6} />
                {t.short}
              </button>
            );
          })}
        </div>
      </nav>

      <Drawer
        open={drawerOpen} onClose={() => setDrawerOpen(false)} tab={tab} onGo={goTab} user={user} profile={profile} unread={unread} isAdmin={isAdmin}
        onAccount={() => { setDrawerOpen(false); setShowAccount(true); }}
        onSignOut={() => { setDrawerOpen(false); supabase.auth.signOut(); }}
        onSignIn={() => { setDrawerOpen(false); setShowAuth(true); }}
        onLegal={(k) => { setDrawerOpen(false); setRootLegal(k); }}
      />

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthed={() => {}} />
      )}
      {flowOpen && user && profile && <OnboardingFlow user={user} status={status} hasBeta={!!profile.trial_ends_at} betaDays={betaDaysLeft} onApplied={loadProfile} onDone={finishOnboarding} />}
      {showAccount && user && <AccountModal user={user} profile={profile} betaActive={betaActive} betaDaysLeft={betaDaysLeft} onSubscribe={() => { setShowAccount(false); handleUpgradeClick(); }} onClose={() => setShowAccount(false)} onLegal={setRootLegal} />}
      {thread && user && <MessageThreadModal user={user} otherUserId={thread.otherUserId} otherName={thread.otherName} onClose={() => setThread(null)} />}
      {pushPrompt && <PushPromptModal onClose={() => setPushPrompt(false)} onDone={() => { setPushPrompt(false); setPushCard(false); }} />}
      {rootLegal === 'terms' && <LegalModal title="Terms of Use" text={TERMS_OF_USE_TEXT} onClose={() => setRootLegal(null)} />}
      {rootLegal === 'privacy' && <LegalModal title="Privacy Policy" text={PRIVACY_POLICY_TEXT} onClose={() => setRootLegal(null)} />}
    </div>
  );
}
