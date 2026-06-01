import { useState } from 'react'
import { EditorProvider } from './state/useEditor'
import { Toolbar } from './components/Toolbar'
import { Canvas } from './components/Canvas'
import { ColorPanel } from './components/ColorPanel'
import { ExportModal } from './components/ExportModal'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'

function App() {
  const [exporting, setExporting] = useState(false)

  return (
    <EditorProvider>
      <KeyboardShortcuts />
      <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
        <header className="flex items-baseline gap-2 px-4 pt-3">
          <h1 className="text-xl font-bold tracking-tight">8BitSVG</h1>
          <span className="text-xs text-neutral-500">
            draw → crop → export transparent SVG
          </span>
        </header>

        <Toolbar onExport={() => setExporting(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 flex-1 overflow-auto bg-neutral-800">
            <Canvas />
          </main>
          <ColorPanel />
        </div>
      </div>

      {exporting && <ExportModal onClose={() => setExporting(false)} />}
    </EditorProvider>
  )
}

export default App
