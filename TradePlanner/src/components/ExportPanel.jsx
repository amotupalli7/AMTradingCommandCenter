import { useRef, useState } from 'react';
import Button from './ui/Button';
import { exportDayAsJSON, exportDayAsMarkdown, exportAllAsJSON, copyDayAsMarkdown, importData } from '../utils/exporters';

export default function ExportPanel({ dayData, getAllData, onImport }) {
  const fileRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      onImport(data);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  };

  const handleCopy = () => {
    copyDayAsMarkdown(dayData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="export-panel">
      <h3 className="section-title">Export / Import</h3>
      <div className="export-buttons">
        <Button variant="ghost" onClick={() => exportDayAsJSON(dayData)}>Export Day (JSON)</Button>
        <Button variant="ghost" onClick={() => exportDayAsMarkdown(dayData)}>Export Day (Markdown)</Button>
        <Button variant="ghost" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy as Markdown'}
        </Button>
        <Button variant="ghost" onClick={() => exportAllAsJSON(getAllData())}>Backup All Data</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>Import Data</Button>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
