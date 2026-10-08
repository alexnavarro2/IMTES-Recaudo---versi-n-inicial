import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import type { ReportModel } from './model';
export const PPTX_RENDERER_VERSION='2026-10-08.1';
const xml=(value:unknown)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export async function buildWeeklyPptx(template:Buffer,model:ReportModel):Promise<Buffer>{
 const zip=await JSZip.loadAsync(template);let replacements=0;
 for(const file of zip.file(/^ppt\/slides\/slide\d+\.xml$/)){let text=await file.async('string');text=text.replace(/\{\{([A-Z]+)\}\}/g,(_,key)=>{if(!(key in model.text))throw new Error('Plantilla de reporte inválida.');replacements++;return xml(model.text[key]);});zip.file(file.name,text);}
 if(replacements!==6)throw new Error('La plantilla de reporte no contiene los seis campos esperados.');
 for(let i=0;i<model.charts.length;i++){
 const chart=model.charts[i],file=`ppt/slides/charts/chart${i+1}.xml`;let content=await zip.file(file)!.async('string');let seriesIndex=0;
 content=content.replace('<c:chartSpace ', '<c:chartSpace xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ');
 content=content.replace(/(<c:title>[\s\S]*?<a:t>)[\s\S]*?(<\/a:t>)/,`$1${xml(chart.title)}$2`);
 content=content.replace(/<c:ser>[\s\S]*?<\/c:ser>/g,block=>{const series=chart.series[seriesIndex],column=String.fromCharCode(66+seriesIndex++);const seriesCategories=series?.categories||chart.categories;if(!series||series.values.length!==seriesCategories.length)throw new Error('Series de reporte incompletas.');const cache=(values:(string|number|null)[])=>`<c:ptCount val="${values.length}"/>`+values.flatMap((v,idx)=>v===null?[]:[`<c:pt idx="${idx}"><c:v>${xml(v)}</c:v></c:pt>`]).join('');
 const categories=`<c:cat><c:strRef><c:f>'Chart Data'!$A$2:$A$${seriesCategories.length+1}</c:f><c:strCache>${cache(seriesCategories)}</c:strCache></c:strRef></c:cat>`;
 const format=i===2?'$#,##0.00':'#,##0';const values=`<c:val><c:numRef><c:f>'Chart Data'!$${column}$2:$${column}$${series.values.length+1}</c:f><c:numCache><c:formatCode>${format}</c:formatCode>${cache(series.values)}</c:numCache></c:numRef></c:val>`;
 const name=`<c:tx><c:strRef><c:f>'Chart Data'!$${column}$1</c:f><c:strCache>${cache([series.name])}</c:strCache></c:strRef></c:tx>`;
 if(i!==1){
 // Show milestones and the latest values without covering every weekly point.
 const valid=series.values.flatMap((value,index)=>value===null?[]:[index]);
 const last=valid.at(-1);
 const indices=last===undefined?[]:i===0?(seriesIndex===1?valid.filter(index=>(index+1)%10===0||index===last):[last]):valid.filter(index=>index===last||index===last-2||index===last-4);
 const labels=indices.map(index=>`<c:dLbl><c:idx val="${index}"/><c:showVal val="1"/></c:dLbl>`).join('');
 const position=i===3?(seriesIndex===1?'t':'b'):(seriesIndex===1?'t':'b');
 const labelFormat=i===2?'$#,##0':'#,##0';
 const tx='<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1050" b="1"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>';
 const labelXml=`<c:dLbls>${labels}<c:numFmt formatCode="${labelFormat}" sourceLinked="0"/>${tx}<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbls>`;
 block=block.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/g,'').replace('<c:cat>',labelXml+'<c:cat>');
 block=block.replace(/<c:smooth[^>]*\/>/g,'').replace('</c:ser>','<c:smooth val="0"/></c:ser>');
 }
 return block.replace(/<c:tx>[\s\S]*?<\/c:tx>/,()=>name).replace(/<c:cat>[\s\S]*?<\/c:cat>/,()=>categories).replace(/<c:val>[\s\S]*?<\/c:val>/,()=>values);
 });if(seriesIndex!==chart.series.length)throw new Error('La plantilla no coincide con las series del reporte.');if(i===1){content=content.replace(/(<c:catAx>[\s\S]*?<c:orientation val=")minMax/, '$1maxMin').replace(/(<c:valAx>[\s\S]*?<c:crosses val=")[^"]+/, '$1max');}zip.file(file,content);
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Chart Data');sheet.addRow(['Semana / perfil',...chart.series.map(s=>s.name)]);chart.categories.forEach((category,row)=>sheet.addRow([category,...chart.series.map(s=>s.values[row])]));for(let c=2;c<=chart.series.length+1;c++)sheet.getColumn(c).numFmt=i===2?'$#,##0.00':'#,##0';zip.file(`ppt/embeddings/chart-data-snapshot-${String(i+1).padStart(3,'0')}.xlsx`,Buffer.from(await workbook.xlsx.writeBuffer()));
 }
 for(const file of zip.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)){let content=await file.async('string');const note=`IMTES Recaudo 360. Corte ${model.cutoff}. Fuentes privadas configuradas en Drive. `+model.sources.map(s=>`${s.source}: ${s.importedAt}`).join('. ')+'. Metas iniciales de la plataforma.';content=content.replace(/<a:t>[\s\S]*?<\/a:t>/,()=>`<a:t>${xml(note)}</a:t>`);zip.file(file.name,content);}
 const result=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});if(result.length>3*1024*1024)throw new Error('El reporte excede el tamaño permitido.');return result;
}
