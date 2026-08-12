// Central theme so every screen shares the same look.
export const T = {
  bg: "#0E1322",
  surface: "#191F33",
  surface2: "#212a43",
  line: "#2b3450",
  text: "#E9ECF6",
  mute: "#8891A9",
  jade: "#5FD6A6",
  amber: "#E0A45B",
};

export const card = () => ({
  background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: 20,
});
export const input = () => ({
  width: "100%", boxSizing: "border-box", background: T.surface2, border: `1px solid ${T.line}`,
  borderRadius: 12, padding: "13px 14px", color: T.text, fontSize: 16, outline: "none",
});
export const btn = (bg, fg, disabled) => ({
  width: "100%", background: bg, color: fg, border: bg === "transparent" ? `1px solid ${T.line}` : "none",
  borderRadius: 13, padding: "15px", fontSize: 16, fontWeight: 700,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
});
export const label = () => ({ fontSize: 12, color: T.mute, marginBottom: 7, letterSpacing: 0.5 });

export const screen = () => ({
  minHeight: "100vh", background: T.bg, color: T.text,
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
});
export const wrap = () => ({ maxWidth: 440, margin: "0 auto", padding: "20px 18px 40px" });
