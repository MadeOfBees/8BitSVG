import { useState } from 'react'
import { EditorProvider } from './state/useEditor'
import { TopBar } from './components/TopBar'
import { LeftSidebar } from './components/LeftSidebar'
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
        <TopBar onExport={() => setExporting(true)} />
        <div className="flex min-h-0 flex-1">
          <LeftSidebar />
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
