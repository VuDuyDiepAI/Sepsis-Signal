import { Bold, Eye, Heading2, Italic, List, PenLine } from "lucide-react";
import { useRef, useState } from "react";
// Store plain text/Markdown in the existing content field. Never render stored HTML.
export function FormattedText({ text }: { text: string }) {
  return (
    <div className="rich-preview">
      {text.split("\n").map((line, i) => {
        const tokens = line
          .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
          .map((t, j) =>
            t.startsWith("**") && t.endsWith("**") ? (
              <strong key={j}>{t.slice(2, -2)}</strong>
            ) : t.startsWith("*") && t.endsWith("*") ? (
              <em key={j}>{t.slice(1, -1)}</em>
            ) : (
              t
            ),
          );
        return line.startsWith("## ") ? (
          <h3 key={i}>{line.slice(3)}</h3>
        ) : (
          <p key={i}>
            {line.startsWith("- ") ? (
              <>
                •{" "}
                {tokens.map((t, j) =>
                  typeof t === "string" && j === 0 ? t.slice(2) : t,
                )}
              </>
            ) : (
              tokens
            )}
            {!line && <br />}
          </p>
        );
      })}
    </div>
  );
}
export function TextEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null),
    [preview, setPreview] = useState(false);
  const format = (before: string, after = "") => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    onChange(
      value.slice(0, start) +
        before +
        value.slice(start, end) +
        after +
        value.slice(end),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  };
  return (
    <div className="text-editor">
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label={"Định dạng " + label}
      >
        <button
          type="button"
          title="In đậm"
          aria-label="In đậm"
          disabled={preview}
          onClick={() => format("**", "**")}
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          title="In nghiêng"
          aria-label="In nghiêng"
          disabled={preview}
          onClick={() => format("*", "*")}
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          title="Tiêu đề"
          aria-label="Chèn tiêu đề"
          disabled={preview}
          onClick={() => format("\n## ")}
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          title="Danh sách"
          aria-label="Chèn danh sách"
          disabled={preview}
          onClick={() => format("\n- ")}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? <PenLine size={16} /> : <Eye size={16} />}{" "}
          {preview ? "Soạn thảo" : "Xem định dạng"}
        </button>
      </div>
      {preview ? (
        <FormattedText text={value} />
      ) : (
        <textarea
          ref={ref}
          aria-label={label}
          value={value}
          rows={7}
          maxLength={20000}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <small>
        Định dạng an toàn: **in đậm**, *in nghiêng*, ## tiêu đề, - danh sách.
        Nội dung được lưu trong trường văn bản hiện có.
      </small>
    </div>
  );
}
