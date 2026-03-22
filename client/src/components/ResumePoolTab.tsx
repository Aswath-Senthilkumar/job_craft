import { useEffect, useState } from "react";
import {
  ResumeProfile, ResumeExperience, ResumeProject, ResumeEducation,
} from "../types";
import {
  fetchPoolProfile, updatePoolProfile,
  fetchPoolExperiences, createPoolExperience, updatePoolExperience, deletePoolExperience,
  fetchPoolProjects, createPoolProject, updatePoolProject, deletePoolProject,
  fetchPoolEducation, createPoolEducation, updatePoolEducation, deletePoolEducation,
  extractPoolSkills,
} from "../api";

type Section = "profile" | "experience" | "projects" | "education";

interface Props {
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
}

const inputCls = "w-full bg-[#0c0f14] border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors";
const labelCls = "text-xs text-gray-300 font-medium block mb-1";

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  function add() {
    const t = input.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5 min-h-[20px]">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 text-xs bg-blue-500/10 border border-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
            {tag}
            <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} className="text-blue-400/60 hover:text-blue-300 leading-none">&times;</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} placeholder={placeholder || "Type and press Enter"} className={inputCls + " flex-1"} />
        <button type="button" onClick={add} className="text-xs px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/20">Add</button>
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────
function ProfileSection({ onFlash, onError }: Props) {
  const [profile, setProfile] = useState<ResumeProfile>({ name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchPoolProfile().then(setProfile).catch(() => {}); }, []);
  function set(k: keyof ResumeProfile, v: string) { setProfile(p => ({ ...p, [k]: v })); }
  async function save() {
    setSaving(true);
    try { await updatePoolProfile(profile); onFlash("Profile saved"); }
    catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {(["name", "email", "phone"] as const).map(k => (
          <div key={k}><label className={labelCls}>{k.charAt(0).toUpperCase() + k.slice(1)}</label><input value={profile[k]} onChange={e => set(k, e.target.value)} className={inputCls} placeholder={k} /></div>
        ))}
        <div>
          <label className={labelCls}>Primary Location</label>
          <select value={profile.location} onChange={e => set("location", e.target.value)} className={inputCls}>
            <option value="">Select country...</option>
            {["United States", "United Kingdom", "Ireland", "Canada", "Germany", "Netherlands", "France", "Australia", "India", "Singapore", "Japan", "South Korea", "Brazil", "Mexico", "Spain", "Italy", "Sweden", "Switzerland", "Poland", "Israel", "United Arab Emirates", "South Africa", "New Zealand"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        {(["linkedin", "github", "portfolio"] as const).map(k => (
          <div key={k}><label className={labelCls}>{k.charAt(0).toUpperCase() + k.slice(1)} URL</label><input value={profile[k]} onChange={e => set(k, e.target.value)} className={inputCls} placeholder="https://..." /></div>
        ))}
      </div>
      <button onClick={save} disabled={saving} className="w-full text-xs font-medium text-gray-200 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 py-2 rounded-lg transition-all disabled:opacity-50">{saving ? "Saving..." : "Save Profile"}</button>
    </div>
  );
}

// ── Experience ────────────────────────────────────────────────────────────────
type ExpForm = Omit<ResumeExperience, "id" | "sort_order">;
const emptyExp = (): ExpForm => ({ company: "", title: "", location: "", start_date: "", end_date: null, summary: "", description: "", skills_used: [] });

function ExperienceSection({ onFlash, onError }: Props) {
  const [items, setItems] = useState<ResumeExperience[]>([]);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<ExpForm>(emptyExp());
  const [isCurrent, setIsCurrent] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchPoolExperiences().then(setItems).catch(() => {}); }, []);
  function setF<K extends keyof ExpForm>(k: K, v: any) { setForm(p => ({ ...p, [k]: v })); }
  function openNew() { setForm(emptyExp()); setIsCurrent(false); setEditId("new"); }
  function openEdit(item: ResumeExperience) { setForm({ company: item.company, title: item.title, location: item.location, start_date: item.start_date, end_date: item.end_date, summary: item.summary || "", description: item.description, skills_used: [...item.skills_used] }); setIsCurrent(!item.end_date); setEditId(item.id); }
  async function save() {
    setSaving(true);
    try {
      const detected = form.description.trim() ? await extractPoolSkills(form.description).catch(() => []) : [];
      const mergedSkills = Array.from(new Set([...form.skills_used, ...detected]));
      const data = { ...form, skills_used: mergedSkills, end_date: isCurrent ? null : form.end_date };
      if (editId === "new") { const c = await createPoolExperience(data); setItems(p => [...p, c]); onFlash("Experience added"); }
      else if (editId !== null) { const u = await updatePoolExperience(editId as number, data); setItems(p => p.map(i => i.id === editId ? u : i)); onFlash("Experience updated"); }
      setEditId(null);
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  }
  async function del(id: number) { await deletePoolExperience(id).catch((e: any) => onError(e.message)); setItems(p => p.filter(i => i.id !== id)); }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
          {editId === item.id ? (
            <ExpFormUI form={form} setF={setF} isCurrent={isCurrent} setIsCurrent={setIsCurrent} saving={saving} onSave={save} onCancel={() => setEditId(null)} />
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200">{item.title} <span className="text-gray-500 font-normal">@ {item.company}</span></p>
                <p className="text-xs text-gray-500">{item.start_date} - {item.end_date || "Present"}{item.location ? ` · ${item.location}` : ""}</p>
                {item.summary && <p className="text-xs text-gray-400 italic mt-0.5">{item.summary}</p>}
                {item.skills_used.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{item.skills_used.slice(0, 6).map(s => <span key={s} className="text-xs text-blue-300/80 bg-blue-500/10 border border-blue-500/15 px-1.5 py-0.5 rounded">{s}</span>)}{item.skills_used.length > 6 && <span className="text-xs text-gray-500">+{item.skills_used.length - 6}</span>}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(item)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded-lg hover:bg-gray-700/50 transition-colors">Edit</button>
                <button onClick={() => del(item.id)} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">Del</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {editId === "new" && <div className="p-3 rounded-xl border border-blue-500/20 bg-[#0f1115]"><ExpFormUI form={form} setF={setF} isCurrent={isCurrent} setIsCurrent={setIsCurrent} saving={saving} onSave={save} onCancel={() => setEditId(null)} /></div>}
      {editId !== "new" && <button onClick={openNew} className="w-full text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 py-2 rounded-xl transition-all">+ Add Experience</button>}
    </div>
  );
}

function ExpFormUI({ form, setF, isCurrent, setIsCurrent, saving, onSave, onCancel }: { form: ExpForm; setF: (k: any, v: any) => void; isCurrent: boolean; setIsCurrent: (v: boolean) => void; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const [detecting, setDetecting] = useState(false);
  async function autoDetect() {
    if (!form.description.trim()) return;
    setDetecting(true);
    try {
      const detected = await extractPoolSkills(form.description);
      const merged = Array.from(new Set([...form.skills_used, ...detected]));
      setF("skills_used", merged);
    } catch { /* ignore */ }
    finally { setDetecting(false); }
  }
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Job Title *</label><input value={form.title} onChange={e => setF("title", e.target.value)} className={inputCls} placeholder="Software Engineer" /></div>
        <div><label className={labelCls}>Company *</label><input value={form.company} onChange={e => setF("company", e.target.value)} className={inputCls} placeholder="Acme Corp" /></div>
        <div><label className={labelCls}>Location</label><input value={form.location} onChange={e => setF("location", e.target.value)} className={inputCls} placeholder="Dublin, Ireland" /></div>
        <div><label className={labelCls}>Start Date</label><input value={form.start_date} onChange={e => setF("start_date", e.target.value)} className={inputCls} placeholder="Jan 2022" /></div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setIsCurrent(!isCurrent)}>
          <div className={`w-8 h-4 rounded-full transition-colors relative ${isCurrent ? "bg-emerald-500/30" : "bg-gray-800"}`}><div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isCurrent ? "left-4 bg-emerald-400" : "left-0.5 bg-gray-600"}`} /></div>
          <span className="text-xs text-gray-400">Currently working here</span>
        </label>
        {!isCurrent && <div className="flex-1"><label className={labelCls}>End Date</label><input value={form.end_date || ""} onChange={e => setF("end_date", e.target.value || null)} className={inputCls} placeholder="Dec 2023" /></div>}
      </div>
      <div><label className={labelCls}>Summary (short tagline for resume)</label><input value={form.summary} onChange={e => setF("summary", e.target.value)} className={inputCls} placeholder="Building scalable analytics infrastructure." /></div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls + " mb-0"}>Description (one bullet per line)</label>
          <button type="button" onClick={autoDetect} disabled={detecting || !form.description.trim()} className="text-xs text-gray-500 hover:text-blue-300 disabled:opacity-30 transition-colors">{detecting ? "Detecting..." : "Auto-detect skills"}</button>
        </div>
        <textarea value={form.description} onChange={e => setF("description", e.target.value)} rows={4} className={inputCls + " resize-none font-mono"} placeholder={"- Built REST APIs with Node.js\n- Led AWS migration, reduced costs 30%"} />
      </div>
      <div><label className={labelCls}>Skills Used</label><TagInput value={form.skills_used} onChange={v => setF("skills_used", v)} placeholder="Type custom skill and press Enter..." /></div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.title || !form.company} className="flex-1 text-xs font-medium text-gray-200 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 py-2 rounded-lg disabled:opacity-50 transition-colors">{saving ? "Saving..." : "Save"}</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-700/40 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────
type ProjForm = Omit<ResumeProject, "id" | "sort_order">;
const emptyProj = (): ProjForm => ({ name: "", summary: "", start_date: "", end_date: null, location: "", description: "", tech_stack: [], url: "" });

function ProjectsSection({ onFlash, onError }: Props) {
  const [items, setItems] = useState<ResumeProject[]>([]);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<ProjForm>(emptyProj());
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchPoolProjects().then(setItems).catch(() => {}); }, []);
  function setF<K extends keyof ProjForm>(k: K, v: any) { setForm(p => ({ ...p, [k]: v })); }
  function openNew() { setForm(emptyProj()); setEditId("new"); }
  function openEdit(item: ResumeProject) { setForm({ name: item.name, summary: item.summary || "", start_date: item.start_date || "", end_date: item.end_date, location: item.location || "", description: item.description, tech_stack: [...item.tech_stack], url: item.url }); setEditId(item.id); }
  async function save() {
    setSaving(true);
    try {
      const detected = form.description.trim() ? await extractPoolSkills(form.description).catch(() => []) : [];
      const mergedStack = Array.from(new Set([...form.tech_stack, ...detected]));
      const data = { ...form, tech_stack: mergedStack };
      if (editId === "new") { const c = await createPoolProject(data); setItems(p => [...p, c]); onFlash("Project added"); }
      else if (editId !== null) { const u = await updatePoolProject(editId as number, data); setItems(p => p.map(i => i.id === editId ? u : i)); onFlash("Project updated"); }
      setEditId(null);
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  }
  async function del(id: number) { await deletePoolProject(id).catch((e: any) => onError(e.message)); setItems(p => p.filter(i => i.id !== id)); }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
          {editId === item.id ? (
            <ProjFormUI form={form} setF={setF} saving={saving} onSave={save} onCancel={() => setEditId(null)} />
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-200">{item.name}</p>
                {(item.start_date || item.location) && <p className="text-xs text-gray-500">{item.start_date}{item.end_date ? ` - ${item.end_date}` : item.start_date ? " - Present" : ""}{item.location ? `${item.start_date ? " · " : ""}${item.location}` : ""}</p>}
                {item.summary && <p className="text-xs text-gray-400 italic">{item.summary}</p>}
                {item.url && <p className="text-xs text-blue-400/70 truncate">{item.url}</p>}
                {item.tech_stack.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{item.tech_stack.slice(0, 6).map(s => <span key={s} className="text-xs text-violet-300/80 bg-violet-500/10 border border-violet-500/15 px-1.5 py-0.5 rounded">{s}</span>)}{item.tech_stack.length > 6 && <span className="text-xs text-gray-500">+{item.tech_stack.length - 6}</span>}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(item)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded-lg hover:bg-gray-700/50 transition-colors">Edit</button>
                <button onClick={() => del(item.id)} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">Del</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {editId === "new" && <div className="p-3 rounded-xl border border-violet-500/20 bg-[#0f1115]"><ProjFormUI form={form} setF={setF} saving={saving} onSave={save} onCancel={() => setEditId(null)} /></div>}
      {editId !== "new" && <button onClick={openNew} className="w-full text-xs font-medium text-violet-400 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 py-2 rounded-xl transition-all">+ Add Project</button>}
    </div>
  );
}

function ProjFormUI({ form, setF, saving, onSave, onCancel }: { form: ProjForm; setF: (k: any, v: any) => void; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const [detecting, setDetecting] = useState(false);
  const [isCurrent, setIsCurrent] = useState(!form.end_date);
  async function autoDetect() {
    if (!form.description.trim()) return;
    setDetecting(true);
    try {
      const detected = await extractPoolSkills(form.description);
      const merged = Array.from(new Set([...form.tech_stack, ...detected]));
      setF("tech_stack", merged);
    } catch { /* ignore */ }
    finally { setDetecting(false); }
  }
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Project Name *</label><input value={form.name} onChange={e => setF("name", e.target.value)} className={inputCls} placeholder="Job Automation Pipeline" /></div>
        <div><label className={labelCls}>Location</label><input value={form.location} onChange={e => setF("location", e.target.value)} className={inputCls} placeholder="USA" /></div>
        <div><label className={labelCls}>Start Date</label><input value={form.start_date} onChange={e => setF("start_date", e.target.value)} className={inputCls} placeholder="Jan 2026" /></div>
        {!isCurrent && <div><label className={labelCls}>End Date</label><input value={form.end_date || ""} onChange={e => setF("end_date", e.target.value || null)} className={inputCls} placeholder="Mar 2026" /></div>}
      </div>
      <label className="flex items-center gap-2 cursor-pointer" onClick={() => { setIsCurrent(!isCurrent); if (!isCurrent) setF("end_date", null); }}>
        <div className={`w-8 h-4 rounded-full transition-colors relative ${isCurrent ? "bg-emerald-500/30" : "bg-gray-800"}`}><div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isCurrent ? "left-4 bg-emerald-400" : "left-0.5 bg-gray-600"}`} /></div>
        <span className="text-xs text-gray-400">Currently active</span>
      </label>
      <div><label className={labelCls}>Summary (short tagline for resume)</label><input value={form.summary} onChange={e => setF("summary", e.target.value)} className={inputCls} placeholder="Cloud-based resume optimization system." /></div>
      <div><label className={labelCls}>URL</label><input value={form.url} onChange={e => setF("url", e.target.value)} className={inputCls} placeholder="https://github.com/..." /></div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls + " mb-0"}>Description (one bullet per line)</label>
          <button type="button" onClick={autoDetect} disabled={detecting || !form.description.trim()} className="text-xs text-gray-500 hover:text-violet-300 disabled:opacity-30 transition-colors">{detecting ? "Detecting..." : "Auto-detect tech"}</button>
        </div>
        <textarea value={form.description} onChange={e => setF("description", e.target.value)} rows={3} className={inputCls + " resize-none font-mono"} placeholder={"- Scrapes 500+ jobs daily\n- Reduced search time by 80%"} />
      </div>
      <div><label className={labelCls}>Tech Stack</label><TagInput value={form.tech_stack} onChange={v => setF("tech_stack", v)} placeholder="Type custom tech and press Enter..." /></div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.name} className="flex-1 text-xs font-medium text-gray-200 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 py-2 rounded-lg disabled:opacity-50 transition-colors">{saving ? "Saving..." : "Save"}</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-700/40 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── Education ─────────────────────────────────────────────────────────────────
type EduForm = Omit<ResumeEducation, "id" | "sort_order">;
const emptyEdu = (): EduForm => ({ institution: "", degree: "", field: "", start_date: "", end_date: "", grade: "" });

function EducationSection({ onFlash, onError }: Props) {
  const [items, setItems] = useState<ResumeEducation[]>([]);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<EduForm>(emptyEdu());
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetchPoolEducation().then(setItems).catch(() => {}); }, []);
  function setF<K extends keyof EduForm>(k: K, v: any) { setForm(p => ({ ...p, [k]: v })); }
  function openNew() { setForm(emptyEdu()); setEditId("new"); }
  function openEdit(item: ResumeEducation) { setForm({ institution: item.institution, degree: item.degree, field: item.field, start_date: item.start_date, end_date: item.end_date, grade: item.grade }); setEditId(item.id); }
  async function save() {
    setSaving(true);
    try {
      if (editId === "new") { const c = await createPoolEducation(form); setItems(p => [...p, c]); onFlash("Education added"); }
      else if (editId !== null) { const u = await updatePoolEducation(editId as number, form); setItems(p => p.map(i => i.id === editId ? u : i)); onFlash("Education updated"); }
      setEditId(null);
    } catch (e: any) { onError(e.message); }
    finally { setSaving(false); }
  }
  async function del(id: number) { await deletePoolEducation(id).catch((e: any) => onError(e.message)); setItems(p => p.filter(i => i.id !== id)); }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="p-3 rounded-xl border border-gray-700/40 bg-[#0e1014]">
          {editId === item.id ? (
            <EduFormUI form={form} setF={setF} saving={saving} onSave={save} onCancel={() => setEditId(null)} />
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-200">{item.degree}{item.field ? ` in ${item.field}` : ""}</p>
                <p className="text-xs text-gray-500">{item.institution}{item.start_date ? ` · ${item.start_date} - ${item.end_date || "Present"}` : ""}{item.grade ? ` · ${item.grade}` : ""}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(item)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded-lg hover:bg-gray-700/50 transition-colors">Edit</button>
                <button onClick={() => del(item.id)} className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">Del</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {editId === "new" && <div className="p-3 rounded-xl border border-amber-500/20 bg-[#0f1115]"><EduFormUI form={form} setF={setF} saving={saving} onSave={save} onCancel={() => setEditId(null)} /></div>}
      {editId !== "new" && <button onClick={openNew} className="w-full text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 py-2 rounded-xl transition-all">+ Add Education</button>}
    </div>
  );
}

function EduFormUI({ form, setF, saving, onSave, onCancel }: { form: EduForm; setF: (k: any, v: any) => void; saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Institution *</label><input value={form.institution} onChange={e => setF("institution", e.target.value)} className={inputCls} placeholder="University of Dublin" /></div>
        <div><label className={labelCls}>Degree *</label><input value={form.degree} onChange={e => setF("degree", e.target.value)} className={inputCls} placeholder="BSc" /></div>
        <div><label className={labelCls}>Field of Study</label><input value={form.field} onChange={e => setF("field", e.target.value)} className={inputCls} placeholder="Computer Science" /></div>
        <div><label className={labelCls}>Grade / GPA</label><input value={form.grade} onChange={e => setF("grade", e.target.value)} className={inputCls} placeholder="First Class Honours" /></div>
        <div><label className={labelCls}>Start Date</label><input value={form.start_date} onChange={e => setF("start_date", e.target.value)} className={inputCls} placeholder="Sep 2019" /></div>
        <div><label className={labelCls}>End Date</label><input value={form.end_date} onChange={e => setF("end_date", e.target.value)} className={inputCls} placeholder="May 2023" /></div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.institution || !form.degree} className="flex-1 text-xs font-medium text-gray-200 bg-gray-700/40 hover:bg-gray-700/60 border border-gray-600/50 py-2 rounded-lg disabled:opacity-50 transition-colors">{saving ? "Saving..." : "Save"}</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-700/40 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ResumePoolTab({ onFlash, onError }: Props) {
  const [section, setSection] = useState<Section>("profile");
  const sections: { id: Section; label: string; activeColor: string }[] = [
    { id: "profile", label: "Profile", activeColor: "text-gray-300 border-gray-700/60 bg-gray-800/60" },
    { id: "experience", label: "Work Experience", activeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    { id: "projects", label: "Projects", activeColor: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
    { id: "education", label: "Education", activeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 leading-relaxed">
        Build your resume pool here. The pipeline uses your pool skills for job relevance scoring, then selects the top matching experiences and projects for each JD before AI tailoring.
      </p>
      <div className="flex gap-1 flex-wrap">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${section === s.id ? s.activeColor : "text-gray-500 border-transparent hover:text-gray-300"}`}>{s.label}</button>
        ))}
      </div>
      {section === "profile" && <ProfileSection onFlash={onFlash} onError={onError} />}
      {section === "experience" && <ExperienceSection onFlash={onFlash} onError={onError} />}
      {section === "projects" && <ProjectsSection onFlash={onFlash} onError={onError} />}
      {section === "education" && <EducationSection onFlash={onFlash} onError={onError} />}
    </div>
  );
}
