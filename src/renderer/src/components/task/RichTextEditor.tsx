import { Component, useState, useCallback, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import type { Editor } from '@tiptap/react'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Maximize2, X } from 'lucide-react'

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface BoundaryState { hasError: boolean }
interface BoundaryProps { children: React.ReactNode; content: string; onBlur: (html: string) => void }

class EditorErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <textarea
          defaultValue={this.props.content}
          onBlur={(e) => this.props.onBlur(e.target.value)}
          rows={5}
          placeholder="Add a description…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:border-green-500 resize-none"
          onContextMenu={(e) => {
            // Allow native context menu for copy/paste
            e.stopPropagation()
          }}
        />
      )
    }
    return this.props.children
  }
}

// ─── Toolbar (outside editor component to avoid remount on each render) ───────

const TEXT_COLORS = ['#000000', '#374151', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899']
const HIGHLIGHT_COLORS = ['#FEF9C3', '#FEE2E2', '#DCFCE7', '#DBEAFE', '#EDE9FE', '#FCE7F3', '#F3F4F6']

function ToolbarButton({ onClick, active, title, children }: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors ${
        active
          ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function EditorToolbar({ editor, onExpand }: { editor: Editor; onExpand: () => void }) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false)

  const closePickers = useCallback(() => {
    setColorPickerOpen(false)
    setHighlightPickerOpen(false)
  }, [])

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 flex-wrap sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold size={13} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic size={13} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <UnderlineIcon size={13} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <Strikethrough size={13} />
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
        <List size={13} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
        <ListOrdered size={13} />
      </ToolbarButton>

      <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Text color */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setColorPickerOpen((v) => !v); setHighlightPickerOpen(false) }}
          title="Text color"
          className="h-7 w-7 flex flex-col items-center justify-center rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors gap-0.5"
        >
          <span className="font-bold text-[13px] leading-none" style={{ color: editor.getAttributes('textStyle').color ?? 'currentColor' }}>A</span>
          <span className="h-1 w-4 rounded-sm" style={{ backgroundColor: editor.getAttributes('textStyle').color ?? '#374151' }} />
        </button>
        {colorPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={closePickers} />
            <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 p-2 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); closePickers() }}
                  className="h-5 w-5 rounded-full border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); closePickers() }}
                className="h-5 w-5 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform flex items-center justify-center text-gray-400 text-[8px]"
                title="Remove color"
              >✕</button>
            </div>
          </>
        )}
      </div>

      {/* Highlight */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setHighlightPickerOpen((v) => !v); setColorPickerOpen(false) }}
          title="Highlight"
          className="h-7 w-7 flex flex-col items-center justify-center rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors gap-0.5"
        >
          <span className="font-bold text-[13px] leading-none">A</span>
          <span className="h-1 w-4 rounded-sm" style={{ backgroundColor: editor.isActive('highlight') ? (editor.getAttributes('highlight').color ?? '#FEF9C3') : '#FEF9C3' }} />
        </button>
        {highlightPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={closePickers} />
            <div className="absolute left-0 top-full z-20 mt-1 flex gap-1 p-2 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setHighlight({ color: c }).run(); closePickers() }}
                  className="h-5 w-5 rounded-full border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button type="button"
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); closePickers() }}
                className="h-5 w-5 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform flex items-center justify-center text-gray-400 text-[8px]"
                title="Remove highlight"
              >✕</button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onExpand() }}
        title="Expand"
        className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Maximize2 size={12} />
      </button>
    </div>
  )
}

// ─── Normalize content: plain text → wrapped paragraph ────────────────────────

function normalizeContent(raw: string): string {
  if (!raw) return ''
  return raw.startsWith('<') ? raw : `<p>${raw}</p>`
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  content: string
  onBlur: (html: string) => void
  placeholder?: string
}

function RichTextEditorInner({ content, onBlur, placeholder = 'Add a description…' }: Props) {
  const [expanded, setExpanded] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: normalizeContent(content),
    onBlur: ({ editor: e }) => {
      onBlur(e.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none min-h-[120px] p-3 dark:prose-invert prose-gray text-gray-900 dark:text-gray-100',
      },
      handleDOMEvents: {
        contextmenu: () => {
          // Allow native context menu for copy/paste
          return false
        },
      },
    },
  })

  // Sync content when prop changes (but not while user is actively editing)
  useEffect(() => {
    if (!editor) return
    // Don't reset while the user is actively editing
    if (editor.isFocused) return
    const incoming = normalizeContent(content)
    // Only update if the content is actually different to avoid cursor resets
    if (editor.getHTML() !== incoming) {
      editor.commands.setContent(incoming, false as unknown as Parameters<typeof editor.commands.setContent>[1]) // don't emit update
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden focus-within:border-green-500 transition-colors">
        <EditorToolbar editor={editor} onExpand={() => setExpanded(true)} />
        <div className="relative max-h-[300px] overflow-y-auto">
          {!editor.getText() && !editor.isFocused && (
            <div className="absolute top-0 left-0 pointer-events-none px-3 py-3 text-sm text-gray-400">{placeholder}</div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      {expanded && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={() => { onBlur(editor.getHTML()); setExpanded(false) }} />
          <div className="fixed left-1/2 top-1/2 z-[301] -translate-x-1/2 -translate-y-1/2 w-[700px] max-w-[95vw] max-h-[80vh] rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Description</span>
              <button
                type="button"
                onClick={() => { onBlur(editor.getHTML()); setExpanded(false) }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <EditorToolbar editor={editor} onExpand={() => setExpanded(false)} />
            <div className="flex-1 overflow-y-auto">
              <EditorContent editor={editor} className="h-full" />
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default function RichTextEditor(props: Props) {
  return (
    <EditorErrorBoundary content={props.content} onBlur={props.onBlur}>
      <RichTextEditorInner {...props} />
    </EditorErrorBoundary>
  )
}
