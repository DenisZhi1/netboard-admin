import { useEffect, useState } from "react";
import "./styles.css";
import { supabase } from "./supabase";

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Admin</h1>
          <div className="muted">Create boards & cards. Publish to public.</div>
        </div>
        <span className="badge">dark MVP</span>
      </div>

      {session ? <Dashboard onLogout={() => supabase.auth.signOut()} /> : <Auth />}
    </div>
  );
}

function Auth() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  const signUp = async () => {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password: pass });
    setMsg(error ? error.message : "Check your email (if confirmations enabled) or try sign in.");
  };

  const signIn = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setMsg(error ? error.message : "Signed in");
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="row">
        <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={signIn}>Sign in</button>
        <button className="btn" onClick={signUp}>Sign up</button>
      </div>
      {msg ? <div className="muted" style={{ marginTop: 10 }}>{msg}</div> : null}
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [boards, setBoards] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("boards")
      .select("id,title,slug,status,visibility,updated_at")
      .order("updated_at", { ascending: false });
    if (error) console.error(error);
    setBoards(data ?? []);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div style={{ width: 360 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="badge">Boards</span>
          <button className="btn" onClick={onLogout}>Logout</button>
        </div>

        <CreateBoard onCreated={load} />

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {boards.map((b) => (
            <button
              key={b.id}
              className="btn"
              style={{
                textAlign: "left",
                borderColor: selectedId === b.id ? "#3a567a" : undefined,
              }}
              onClick={() => setSelectedId(b.id)}
            >
              <div style={{ fontWeight: 700 }}>{b.title}</div>
              <div className="muted">{b.slug} - {b.status}/{b.visibility}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 320 }}>
        {selectedId ? (
          <BoardEditor boardId={selectedId} onChanged={load} />
        ) : (
          <div className="muted">Select a board…</div>
        )}
      </div>
    </div>
  );
}

function CreateBoard({ onCreated }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const create = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;

    const safeSlug = (slug || title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const { error } = await supabase.from("boards").insert({
      owner_id: uid,
      title: title || "Untitled",
      slug: safeSlug || `board-${Date.now()}`,
      status: "draft",
      visibility: "public",
    });

    if (error) alert(error.message);
    setTitle("");
    setSlug("");
    onCreated?.();
  };

  return (
    <div>
      <div className="row">
        <input className="input" placeholder="Board title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={create}>Create board</button>
      </div>
    </div>
  );
}

function BoardEditor({ boardId, onChanged }) {
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = async () => {
    const { data: b, error: be } = await supabase.from("boards").select("*").eq("id", boardId).single();
    if (be) console.error(be);
    setBoard(b || null);

    const { data: cat, error: catErr } = await supabase
      .from("categories")
      .select("*")
      .eq("board_id", boardId)
      .order("order_index", { ascending: true });

    if (catErr) console.error(catErr);
    setCategories(cat ?? []);

    const { data: c, error: ce } = await supabase
      .from("cards")
      .select("*")
      .eq("board_id", boardId)
      .order("order_index", { ascending: true });

    if (ce) console.error(ce);
    setCards(c ?? []);
  };

  useEffect(() => { load(); }, [boardId]);

  const setStatus = async (status) => {
    const { error } = await supabase.from("boards").update({ status }).eq("id", boardId);
    if (error) alert(error.message);
    await load();
    onChanged?.();
  };

  const removeCard = async (id) => {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) alert(error.message);
    await load();
  };

  const createCategory = async (title) => {
    const name = (title || "").trim();
    if (!name) return;

    const { error } = await supabase.from("categories").insert({
      board_id: boardId,
      title: name,
      order_index: categories.length,
    });

    if (error) alert(error.message);
    await load();
  };

  const deleteCategory = async (catId) => {
    // удаляем категорию, карточки останутся с category_id = null (on delete set null)
    const { error } = await supabase.from("categories").delete().eq("id", catId);
    if (error) alert(error.message);
    await load();
  };

  const setBackgroundUrl = async (url) => {
    const clean = (url || "").trim() || null;
    const { error } = await supabase.from("boards").update({ background_url: clean }).eq("id", boardId);
    if (error) alert(error.message);
    await load();
    onChanged?.();
  };

  if (!board) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{board.title}</div>
          <div className="muted">slug: {board.slug}</div>
        </div>
        <div className="row">
          {board.status !== "published" ? (
            <button className="btn" onClick={() => setStatus("published")}>Publish</button>
          ) : (
            <button className="btn" onClick={() => setStatus("draft")}>Unpublish</button>
          )}
        </div>
      </div>

      {/* Background URL (опционально, но уже работает в public) */}
      <BackgroundUrlEditor value={board.background_url || ""} onSave={setBackgroundUrl} />

      {/* Categories */}
      <CategoriesEditor
        categories={categories}
        onCreate={createCategory}
        onDelete={deleteCategory}
      />

      {/* Create card with category dropdown */}
      <CreateCard
        boardId={boardId}
        nextIndex={cards.length}
        categories={categories}
        onCreated={load}
      />

      <div style={{ marginTop: 14 }} className="grid">
        {cards.map((c) => (
          <div key={c.id} className="card" style={{ cursor: "default" }}>
            {c.image_url ? <img src={c.image_url} alt="" /> : <div style={{ height: 210 }} />}
            <div className="pad">
              <div className="title">{c.title}</div>
              {c.description ? <div className="desc">{c.description}</div> : null}
              {c.link_url ? <div className="muted">{c.link_url}</div> : <div className="muted">No link</div>}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="badge">#{c.order_index}</span>
                <button className="btn" onClick={() => removeCard(c.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="muted" style={{ marginTop: 12 }}>
        Public URL will be: <code>#/b/{board.slug}</code> on your public site.
      </div>
    </div>
  );
}

function CategoriesEditor({ categories, onCreate, onDelete }) {
  const [title, setTitle] = useState("");

  return (
    <div style={{ border: "1px solid #1f2a3a", borderRadius: 14, padding: 12, background: "#0f1726", marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="badge">Categories</span>
        <span className="muted">Used as tabs on public board</span>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <input
          className="input"
          placeholder="New category title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" onClick={() => { onCreate(title); setTitle(""); }}>
          Add category
        </button>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {categories.map((c) => (
          <span key={c.id} className="badge" style={{ gap: 10 }}>
            {c.title}
            <button className="btn" style={{ padding: "6px 10px" }} onClick={() => onDelete(c.id)}>
              Delete
            </button>
          </span>
        ))}
      </div>

      {categories.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No categories yet.</div> : null}
    </div>
  );
}

function BackgroundUrlEditor({ value, onSave }) {
  const [v, setV] = useState(value);

  useEffect(() => setV(value), [value]);

  return (
    <div style={{ border: "1px solid #1f2a3a", borderRadius: 14, padding: 12, background: "#0f1726", marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="badge">Background</span>
        <span className="muted">Paste image URL (optional)</span>
      </div>
      <div className="row">
        <input className="input" placeholder="https://.../background.png" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn" onClick={() => onSave(v)}>Save</button>
      </div>
    </div>
  );
}


function CreateCard({ boardId, nextIndex, categories, onCreated }) {
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const uploadImageIfAny = async () => {
    if (!file) return null;

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${boardId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage.from("card-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/png",
    });
    if (upErr) throw upErr;

    const { data } = supabase.storage.from("card-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const create = async () => {
    setBusy(true);
    try {
      const imageUrl = await uploadImageIfAny();

      const cleanLink = linkUrl.trim();
      const normalizedLink =
        cleanLink && !/^https?:\/\//i.test(cleanLink) ? `https://${cleanLink}` : cleanLink;

      const { error } = await supabase.from("cards").insert({
        board_id: boardId,
        title: title || "Untitled card",
        description: description || "",
        image_url: imageUrl,
        link_url: normalizedLink || null,
        order_index: nextIndex,
        category_id: categoryId || null,
      });

      if (error) throw error;

      setTitle("");
      setDescription("");
      setLinkUrl("");
      setFile(null);
      onCreated?.();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setCategoryId("");
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid #1f2a3a", borderRadius: 14, padding: 12, background: "#0f1726" }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="Card title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Link (opens new tab)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
      </div>
      
      <div className="row" style={{ marginBottom: 10 }}>
        <select
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">No category (shows in All)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? "Saving…" : "Add card"}
        </button>
      </div>
      <div className="muted">Tip: link without https will be auto-fixed.</div>
    </div>
  );
}
