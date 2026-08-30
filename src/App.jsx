import { useEffect, useState, useCallback } from 'react';
import { supabase } from './lib/supabase';
import {
  Calendar, Users, ShoppingBag, Briefcase, FileText, LogIn, LogOut,
  MapPin, X, Download, ExternalLink, Loader2, Sparkles, Building2,
  MessageCircle, Send, Search, ShieldCheck, Inbox, Plus
} from 'lucide-react';

/* ---------------------------------------------------------
   Small shared UI bits
--------------------------------------------------------- */

function Logo({ className = 'h-8' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 100 60" className="h-full w-auto" fill="none">
        <text x="50" y="18" textAnchor="middle" fontFamily="Cinzel" fontSize="9" fill="#C9A227" letterSpacing="2">THE</text>
        <text x="50" y="34" textAnchor="middle" fontFamily="Cinzel" fontSize="17" fill="#C9A227" fontWeight="600">BOARDROOM</text>
        <line x1="10" y1="38" x2="90" y2="38" stroke="#C9A227" strokeWidth="1" />
        <line x1="25" y1="38" x2="15" y2="55" stroke="#C9A227" strokeWidth="1.5" />
        <line x1="75" y1="38" x2="85" y2="55" stroke="#C9A227" strokeWidth="1.5" />
        <text x="72" y="48" textAnchor="middle" fontFamily="Cinzel" fontSize="7" fill="#C9A227">JA</text>
      </svg>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] tracking-[0.24em] uppercase text-wine font-sans mb-2">
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="text-center py-16 px-6">
      <Icon className="mx-auto mb-4 text-navy/25" size={36} strokeWidth={1.25} />
      <h3 className="font-display text-lg text-navy mb-1">{title}</h3>
      <p className="text-navy/55 text-sm max-w-sm mx-auto">{body}</p>
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
    <div className={`bg-white border border-navy/10 rounded-sm ${className}`}>
      {children}
    </div>
  );
}

function GoldButton({ children, onClick, href, disabled, type = 'button', download }) {
  const cls = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-navy text-[13px] tracking-[0.06em] uppercase font-medium hover:bg-[#dfb93a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} download={download || undefined}>
        {children}
      </a>
    );
  }
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
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
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ivory max-w-sm w-full p-8 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-navy/40 hover:text-navy">
          <X size={18} />
        </button>
        <Logo className="h-10 mb-6" />
        <h2 className="font-display text-xl text-navy mb-1">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-sm text-navy/55 mb-6 font-serif italic">
          Free beta access &mdash; join the room.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text" required placeholder="Full name" value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
            />
          )}
          <input
            type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
          />
          <input
            type="password" required placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            className="w-full px-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
          />
          {error && <p className="text-wine text-xs">{error}</p>}
          <GoldButton type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : (mode === 'signup' ? 'Sign up' : 'Sign in')}
          </GoldButton>
        </form>
        <button
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          className="mt-4 text-xs text-emerald hover:underline font-sans"
        >
          {mode === 'signup' ? 'Already a member? Sign in' : "New here? Create an account"}
        </button>
      </div>
    </div>
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
      setError(err.message);
    } else {
      setText('');
      await load();
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ivory max-w-md w-full h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy/10 bg-navy text-ivory">
          <div>
            <p className="font-display text-base">{otherName}</p>
            <p className="text-[11px] flex items-center gap-1 text-gold"><ShieldCheck size={12} /> Encrypted message thread</p>
          </div>
          <button onClick={onClose} className="text-ivory/60 hover:text-ivory"><X size={18} /></button>
        </div>

        <div className="flex-grow overflow-y-auto px-5 py-4 space-y-3">
          {messages === null ? <Spinner /> : messages.length === 0 ? (
            <p className="text-sm text-navy/50 text-center pt-8">No messages yet — say hello.</p>
          ) : messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3.5 py-2 text-sm ${mine ? 'bg-emerald text-ivory' : 'bg-white border border-navy/10 text-navy'}`}>
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-navy/10 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-grow px-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
          />
          <button type="submit" disabled={sending} className="px-4 bg-gold text-navy disabled:opacity-40">
            {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          </button>
        </form>
        {error && <p className="text-wine text-xs px-3 pb-2">{error}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Directory tab
--------------------------------------------------------- */

const DIRECTORY_REQUIRED = ['business_name', 'category', 'description', 'parish', 'contact_email'];

function ListBusinessForm({ user, existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    business_name: existing?.business_name || '',
    category: existing?.category || '',
    description: existing?.description || '',
    parish: existing?.parish || '',
    contact_email: existing?.contact_email || '',
    phone: existing?.phone || '',
    website_url: existing?.website_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const missing = DIRECTORY_REQUIRED.filter((f) => !form[f]?.trim());
    if (missing.length) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { ...form, user_id: user.id, is_active: true };
    const { error: err } = await supabase.from('business_directory').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      onSaved();
      onClose();
    }
  }

  const field = (key, label, opts = {}) => (
    <div className="mb-3">
      <label className="text-[12px] tracking-wide text-wine block mb-1">
        {label}{DIRECTORY_REQUIRED.includes(key) && <span className="text-wine"> *</span>}
      </label>
      {opts.textarea ? (
        <textarea
          rows={3}
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
          className="w-full px-3 py-2 border border-navy/20 bg-white text-sm focus:outline-gold"
        />
      ) : (
        <input
          type={opts.type || 'text'}
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
          className="w-full px-3 py-2 border border-navy/20 bg-white text-sm focus:outline-gold"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-ivory max-w-lg w-full p-7 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-display text-xl text-navy">{existing ? 'Edit your listing' : 'List your business'}</h2>
          <button onClick={onClose} className="text-navy/40 hover:text-navy"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          {field('business_name', 'Business name')}
          {field('category', 'Industry / category')}
          {field('description', 'Description', { textarea: true })}
          {field('parish', 'Parish')}
          {field('contact_email', 'Contact email', { type: 'email' })}
          {field('phone', 'Phone / WhatsApp')}
          {field('website_url', 'Website')}
          {error && <p className="text-wine text-xs mb-3">{error}</p>}
          <GoldButton type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={16} /> : existing ? 'Save changes' : 'Submit listing'}
          </GoldButton>
        </form>
      </div>
    </div>
  );
}

function DirectoryTab({ user, onRequireAuth }) {
  const [businesses, setBusinesses] = useState(null);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [myListing, setMyListing] = useState(null);
  const [thread, setThread] = useState(null); // { otherUserId, otherName }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('business_directory')
      .select('*')
      .eq('is_active', true)
      .order('business_name', { ascending: true });
    setBusinesses(data || []);

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
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, industry, or parish…"
            className="w-full pl-9 pr-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
          />
        </div>
        <GoldButton onClick={handleAddClick}>
          <Plus size={14} /> {myListing ? 'Edit my listing' : 'List my business'}
        </GoldButton>
      </div>

      {businesses === null ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No businesses found" body="Try a different search, or be the first to list your business." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((b) => (
            <Card key={b.id} className="p-5 flex flex-col">
              <SectionLabel>{b.category}</SectionLabel>
              <h3 className="font-display text-lg text-navy mb-1">{b.business_name}</h3>
              <p className="text-xs text-navy/50 mb-2 flex items-center gap-1"><MapPin size={12} /> {b.parish}</p>
              <p className="text-sm text-navy/75 mb-4 flex-grow line-clamp-4">{b.description}</p>
              <div className="flex items-center gap-2 mt-auto pt-2">
                {b.website_url && (
                  <a href={b.website_url.startsWith('http') ? b.website_url : `https://${b.website_url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald hover:underline flex items-center gap-1">
                    Website <ExternalLink size={11} />
                  </a>
                )}
                <div className="flex-grow" />
                {b.user_id !== user?.id && (
                  <GoldButton onClick={() => handleMessageClick(b)}>
                    <MessageCircle size={14} /> Message
                  </GoldButton>
                )}
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

function MessagesTab({ user, onRequireAuth }) {
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
              <MessageCircle size={16} className="text-emerald" />
              <span className="font-medium text-navy text-sm">{c.name}</span>
            </div>
            <span className="text-xs text-navy/40">{new Date(c.last_message_at).toLocaleDateString()}</span>
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
   Events tab
--------------------------------------------------------- */

function EventsTab({ user, onRequireAuth }) {
  const [events, setEvents] = useState(null);
  const [rsvpdIds, setRsvpdIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);

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

  if (events.length === 0) {
    return <EmptyState icon={Calendar} title="No events yet" body="Check back soon — upcoming Boardroom JA events will appear here." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {events.map((ev) => {
        const going = rsvpdIds.has(ev.id);
        const date = ev.event_date ? new Date(ev.event_date) : null;
        return (
          <Card key={ev.id} className="p-5 flex flex-col">
            <SectionLabel>{ev.event_type === 'ticketed' ? 'Ticketed' : 'RSVP'}</SectionLabel>
            <h3 className="font-display text-lg text-navy mb-1">{ev.title}</h3>
            {date && (
              <p className="text-xs text-navy/55 mb-2 font-sans">
                {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            {ev.location && (
              <p className="text-xs text-navy/55 mb-3 flex items-center gap-1"><MapPin size={12} /> {ev.location}</p>
            )}
            {ev.description && <p className="text-sm text-navy/75 mb-4 flex-grow">{ev.description}</p>}
            <div className="flex items-center justify-between mt-auto pt-2">
              <span className="text-sm font-serif italic text-emerald">{ev.price_text || 'Free'}</span>
              {ev.event_type === 'ticketed' && ev.ticket_checkout_url ? (
                <GoldButton href={ev.ticket_checkout_url}>Get ticket</GoldButton>
              ) : (
                <GoldButton onClick={() => handleRsvp(ev.id)} disabled={going || busyId === ev.id}>
                  {busyId === ev.id ? <Loader2 className="animate-spin" size={14} /> : going ? "You're going" : 'RSVP'}
                </GoldButton>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   Skillswap tab
--------------------------------------------------------- */

function SkillswapTab({ user, onRequireAuth }) {
  const [offers, setOffers] = useState(null);
  const [wants, setWants] = useState(null);
  const [view, setView] = useState('offers');
  const [skillInput, setSkillInput] = useState('');
  const [posting, setPosting] = useState(false);

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

  const list = view === 'offers' ? offers : wants;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {['offers', 'wants'].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-[13px] tracking-wide uppercase font-sans border ${view === v ? 'bg-navy text-ivory border-navy' : 'border-navy/20 text-navy/60 hover:border-navy/40'}`}
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
          className="flex-grow px-3 py-2.5 border border-navy/20 bg-white text-sm focus:outline-gold"
        />
        <GoldButton type="submit" disabled={posting}>
          {posting ? <Loader2 className="animate-spin" size={14} /> : 'Post'}
        </GoldButton>
      </form>

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState icon={Users} title="Nothing posted yet" body="Be the first to post a skill in this category." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((item) => (
            <Card key={item.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-navy text-sm">{item.skill}</p>
                <p className="text-xs text-navy/50">{item.profiles?.full_name || item.profiles?.business_name || 'A member'}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Shop tab
--------------------------------------------------------- */

function ShopTab() {
  const [products, setProducts] = useState(null);

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProducts(data || []));
  }, []);

  if (products === null) return <Spinner />;
  if (products.length === 0) {
    return <EmptyState icon={ShoppingBag} title="Shop coming soon" body="Member products and services will be listed here." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <Card key={p.id} className="p-5 flex flex-col">
          {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-36 object-cover mb-3" />}
          <h3 className="font-display text-base text-navy mb-1">{p.name}</h3>
          {p.description && <p className="text-sm text-navy/70 mb-3 flex-grow">{p.description}</p>}
          <div className="flex items-center justify-between mt-auto pt-2">
            <span className="text-sm font-serif italic text-emerald">{p.price_text}</span>
            {p.checkout_url ? (
              <GoldButton href={p.checkout_url}>Buy</GoldButton>
            ) : (
              <span className="text-xs text-navy/40 uppercase tracking-wide">{p.stock_status?.replace('_', ' ')}</span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Jobs tab
--------------------------------------------------------- */

function JobsTab() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    supabase
      .from('jobs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setJobs(data || []));
  }, []);

  if (jobs === null) return <Spinner />;
  if (jobs.length === 0) {
    return <EmptyState icon={Briefcase} title="No listings yet" body="Job postings from Boardroom JA members and partners will appear here." />;
  }

  return (
    <div className="space-y-3">
      {jobs.map((j) => (
        <Card key={j.id} className="p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base text-navy mb-0.5">{j.title}</h3>
            <p className="text-sm text-navy/60">{j.company}{j.location ? ` · ${j.location}` : ''}</p>
          </div>
          <a
            href={j.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-1 text-xs uppercase tracking-wide text-emerald hover:underline"
          >
            View <ExternalLink size={12} />
          </a>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   Resources tab — FREE ONLY for beta
--------------------------------------------------------- */

function ResourcesTab() {
  const [resources, setResources] = useState(null);

  useEffect(() => {
    supabase
      .from('resources')
      .select('*')
      .eq('is_active', true)
      .eq('resource_type', 'free')
      .order('created_at', { ascending: false })
      .then(({ data }) => setResources(data || []));
  }, []);

  if (resources === null) return <Spinner />;

  if (resources.length === 0) {
    return <EmptyState icon={FileText} title="Resources loading" body="Free member resources will appear here shortly." />;
  }

  return (
    <div>
      <div className="mb-6 flex items-start gap-2 bg-gold/10 border border-gold/30 px-4 py-3">
        <Sparkles size={16} className="text-gold flex-shrink-0 mt-0.5" />
        <p className="text-sm text-navy/70">
          Beta access — every resource here is free while we're testing. Paid, member-only resources arrive later.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {resources.map((r) => (
          <Card key={r.id} className="p-5 flex flex-col">
            <SectionLabel>{r.category || 'Resource'}</SectionLabel>
            <h3 className="font-display text-lg text-navy mb-1">{r.title}</h3>
            {r.description && <p className="text-sm text-navy/70 mb-4 flex-grow">{r.description}</p>}
            {r.file_url && (
              <GoldButton href={r.file_url} download={r.file_url.split('/').pop()}>
                <Download size={14} /> Download
              </GoldButton>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Root App
--------------------------------------------------------- */

const TABS = [
  { key: 'directory', label: 'Directory', icon: Building2, Comp: DirectoryTab, accent: '#7A1E3D' },
  { key: 'events', label: 'Events', icon: Calendar, Comp: EventsTab, accent: '#C9A227' },
  { key: 'skillswap', label: 'Skillswap', icon: Users, Comp: SkillswapTab, accent: '#114B3B' },
  { key: 'shop', label: 'Shop', icon: ShoppingBag, Comp: ShopTab, accent: '#7A1E3D' },
  { key: 'jobs', label: 'Jobs', icon: Briefcase, Comp: JobsTab, accent: '#114B3B' },
  { key: 'resources', label: 'Resources', icon: FileText, Comp: ResourcesTab, accent: '#C9A227' },
  { key: 'messages', label: 'Messages', icon: Inbox, Comp: MessagesTab, accent: '#114B3B' },
];

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [tab, setTab] = useState('directory');
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const active = TABS.find((t) => t.key === tab);
  const ActiveComp = active.Comp;

  return (
    <div className="min-h-screen bg-ivory font-sans">
      {/* Header */}
      <header className="bg-navy text-ivory sticky top-0 z-40 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo className="h-9" />
          {user === undefined ? null : user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ivory/80 hover:text-gold"
            >
              <LogOut size={14} /> Sign out
            </button>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ivory/80 hover:text-gold"
            >
              <LogIn size={14} /> Sign in
            </button>
          )}
        </div>
        <div className="border-t border-ivory/10">
          <div className="max-w-5xl mx-auto px-2 flex overflow-x-auto scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={tab === t.key ? { borderColor: t.accent, color: t.accent } : undefined}
                className={`flex items-center gap-1.5 px-4 py-3 text-[13px] tracking-wide uppercase whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key ? '' : 'border-transparent text-ivory/60 hover:text-ivory'
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Beta banner */}
      <div className="bg-emerald/10 border-b border-emerald/20">
        <div className="max-w-5xl mx-auto px-4 py-2 text-center text-xs text-emerald font-medium">
          You're on the free beta — everything is open while we test. Thank you for being here early.
        </div>
      </div>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl" style={{ color: active.accent }}>{active.label}</h1>
        </div>
        <ActiveComp user={user} onRequireAuth={() => setShowAuth(true)} />
      </main>

      <footer className="border-t border-navy/10 py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-navy/40 font-serif italic">
          The Boardroom JA — Build the table. Don't wait for a seat.
        </div>
      </footer>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onAuthed={() => {}} />
      )}
    </div>
  );
}
