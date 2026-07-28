import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  Heading1,
  Heading2,
  RemoveFormatting,
  Undo2,
  Redo2,
  PilcrowRight,
  PilcrowLeft,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const RichTextEditor = ({ value, onChange, placeholder, minHeight = 240 }: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string>("");

  useEffect(() => {
    // Force <p> as the paragraph separator so Enter doesn't create <div><br></div>
    // pairs that visually double the line spacing.
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch {}
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastValueRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || "";
      lastValueRef.current = value || "";
    }
  }, [value]);


  const emit = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      editorRef.current?.focus();
      try {
        document.execCommand(command, false, arg);
      } catch {}
      emit();
    },
    [emit],
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("הכנס קישור (URL):", "https://");
    if (!url) return;
    exec("createLink", url);
    // Ensure link opens in new tab
    const sel = window.getSelection();
    const node = sel?.anchorNode?.parentElement;
    if (node && node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      emit();
    }
  }, [exec, emit]);

  const setDirection = useCallback(
    (dir: "rtl" | "ltr") => {
      editorRef.current?.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      let node: Node | null = range.commonAncestorContainer;
      const root = editorRef.current;
      const isBlock = (el: Element) =>
        /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|UL|OL|BLOCKQUOTE|PRE|TD|TH)$/.test(el.tagName);
      // Collect block elements in selection
      const blocks = new Set<Element>();
      const addBlockFor = (n: Node | null) => {
        let cur: Node | null = n;
        while (cur && cur !== root) {
          if (cur.nodeType === 1 && isBlock(cur as Element)) {
            blocks.add(cur as Element);
            return;
          }
          cur = cur.parentNode;
        }
        if (root) blocks.add(root);
      };
      if (range.collapsed) {
        addBlockFor(node);
      } else {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (el) =>
            range.intersectsNode(el) && isBlock(el as Element)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP,
        });
        let found = false;
        while (walker.nextNode()) {
          blocks.add(walker.currentNode as Element);
          found = true;
        }
        if (!found) addBlockFor(node);
      }
      blocks.forEach((el) => {
        el.setAttribute("dir", dir);
        (el as HTMLElement).style.textAlign = dir === "rtl" ? "right" : "left";
      });
      emit();
    },
    [emit],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      editorRef.current?.focus();
      try {
        document.execCommand("insertText", false, text);
      } catch {
        if (editorRef.current) editorRef.current.innerText += text;
      }
      emit();
    },
    [emit],
  );

  // Expose insert method through a custom event to keep API simple
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") insertAtCursor(detail);
    };
    el.addEventListener("rte-insert", handler);
    return () => el.removeEventListener("rte-insert", handler);
  }, [insertAtCursor]);

  const btnCls = "h-8 w-8 p-0 rounded-md";

  return (
    <div className="rounded-xl border border-input bg-background overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/30 p-1.5" dir="rtl">
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("bold")} title="הדגשה">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("italic")} title="הטיה">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("underline")} title="קו תחתון">
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("strikeThrough")} title="קו חוצה">
          <Strikethrough className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("formatBlock", "H1")} title="כותרת 1">
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("formatBlock", "H2")} title="כותרת 2">
          <Heading2 className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("insertUnorderedList")} title="רשימה">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("insertOrderedList")} title="רשימה ממוספרת">
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("justifyRight")} title="יישור לימין">
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("justifyCenter")} title="יישור למרכז">
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("justifyLeft")} title="יישור לשמאל">
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("justifyFull")} title="יישור לשני הצדדים">
          <AlignJustify className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => setDirection("rtl")} title="כיוון ימין לשמאל (RTL)">
          <PilcrowRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => setDirection("ltr")} title="כיוון שמאל לימין (LTR)">
          <PilcrowLeft className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={insertLink} title="קישור">
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("removeFormat")} title="נקה עיצוב">
          <RemoveFormatting className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("undo")} title="בטל">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className={btnCls} onClick={() => exec("redo")} title="חזור">
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        dir="rtl"
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="prose prose-sm max-w-none p-3 text-sm text-foreground focus:outline-none [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pr-5 [&_ol]:pr-5 [&_a]:text-primary [&_a]:underline empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
        style={{ minHeight, direction: "rtl", textAlign: "right" }}
        suppressContentEditableWarning
      />
    </div>
  );
};

export default RichTextEditor;
