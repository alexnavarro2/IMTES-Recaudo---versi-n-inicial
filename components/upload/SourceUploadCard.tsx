'use client';

import { useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { SourceExplorer } from '@/components/drive/source-explorer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Source } from '@/types/domain';

export type UploadSource = { name: Source; title: string; description: string; formatLabel: string; extensions: string[] };

export function SourceUploadCard({ source, files, onSelect, onRemove }: { source: UploadSource; files: File[]; onSelect: (files: File[]) => void; onRemove: (index: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <article className="panel upload-panel">
      <div className="panel-heading"><div><h2>{source.title}</h2><p>{source.description}</p></div><StatusBadge tone={files.length ? 'selected' : 'pending'}>{files.length ? 'Seleccionado' : 'Pendiente'}</StatusBadge></div>
      <p className="source-format">{source.formatLabel}</p>
      <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); onSelect(Array.from(event.dataTransfer.files)); }}>
        <span className="upload-icon"><Upload size={25} strokeWidth={1.5}/></span><strong>Arrastra tus archivos aquí</strong><span>o selecciónalos desde tu equipo</span>
        <label className="button outline file-label">Seleccionar archivo<input aria-label={`Seleccionar archivo ${source.title}`} type="file" accept={source.extensions.map(extension => '.' + extension).join(',')} multiple onChange={event => { onSelect(Array.from(event.target.files ?? [])); event.target.value = ''; }}/></label>
      </div>
      <div className="file-list" aria-live="polite">{files.map((file, index) => <div className="selected-file" key={`${file.name}-${index}`}><FileText size={19}/><div><strong>{file.name}</strong><small>{(file.size / 1024).toLocaleString('es-MX', { maximumFractionDigits: 1 })} KB · Tipo: {file.name.split('.').pop()?.toUpperCase() || 'Desconocido'}</small><small>Estado: seleccionado, sin procesar</small></div><button type="button" aria-label={`Quitar ${file.name}`} onClick={() => onRemove(index)}><X size={16}/></button></div>)}</div>
      <SourceExplorer type={source.name}/>
    </article>
  );
}
