(() => {
const $=id=>document.getElementById(id);
let items=[],files=new Map(),basenames=new Map(),allProjectFiles=[],testRunner=null,projectDirHandle=null,currentAnalysis=null,providerRule={type:"prefix",count:3},selectedParticipantDetail="";
function norm(s){return String(s||"").replaceAll("\\","/").replace(/^\/+/,"").toLowerCase()}
function bn(s){const a=norm(s).split("/");return a[a.length-1]}
function audioExt(name){return /\.(wav|mp3|m4a|ogg)$/i.test(name)}
function escapeHtml(s){return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function parseOptionLabels(text){return String(text||"").split("|").map(x=>x.trim()).filter(Boolean)}
function labelsToOptions(labels){return labels.map((label,i)=>({value:String(i+1),label}))}
function itemOptionText(item){return (item.options||[]).map(x=>x.label).join(" | ")}
function projectId(){return $("experimentId").value.trim()||"experiment"}
function masterName(){return `${projectId()}_master.json`}
function participantName(){return `${projectId()}_experiment.json`}
function updateNames(){$("masterFilename").textContent=masterName();$("participantFilename").textContent=participantName()}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadJson(obj,name){downloadBlob(new Blob([JSON.stringify(obj,null,2)],{type:"application/json;charset=utf-8"}),name)}
function resolveFile(path){const n=norm(path);if(files.has(n))return files.get(n);const a=basenames.get(bn(n))||[];return a.length===1?a[0]:null}

async function indexHandle(handle,prefix=""){
 for await(const [name,h] of handle.entries()){
  const rel=prefix?`${prefix}/${name}`:name;
  if(h.kind==="directory")await indexHandle(h,rel);else{const f=await h.getFile();allProjectFiles.push({rel,file:f});if(audioExt(name)){files.set(norm(rel),f);const b=bn(rel);if(!basenames.has(b))basenames.set(b,[]);basenames.get(b).push(f)}}
 }
}
async function openProjectFolder(){
 files.clear();basenames.clear();allProjectFiles=[];projectDirHandle=null;
 if(window.showDirectoryPicker&&window.isSecureContext){try{projectDirHandle=await window.showDirectoryPicker({mode:"readwrite"});await indexHandle(projectDirHandle);await finishProjectRead()}catch(e){if(e.name!=="AbortError")setProjectStatus(`프로젝트 폴더를 열 수 없습니다: ${escapeHtml(e.message)}`,"error")}}
 else{$("fallbackProjectFolder").value="";$("fallbackProjectFolder").click()}
}
$("fallbackProjectFolder").onchange=async e=>{
 files.clear();basenames.clear();allProjectFiles=[];projectDirHandle=null;
 for(const f of e.target.files){const rel=(f.webkitRelativePath||f.name).replaceAll("\\","/").split("/").slice(1).join("/")||f.name;allProjectFiles.push({rel,file:f});if(audioExt(f.name)){files.set(norm(rel),f);const b=bn(rel);if(!basenames.has(b))basenames.set(b,[]);basenames.get(b).push(f)}}
 await finishProjectRead();
};
function setProjectStatus(html,kind=""){$("projectStatus").className=`notice ${kind}`;$("projectStatus").innerHTML=html;$("projectStatus").classList.remove("hidden")}
async function finishProjectRead(){
 const masters=allProjectFiles.filter(x=>/_master\.json$/i.test(x.file.name));
 if(masters.length>1){setProjectStatus(`master JSON이 ${masters.length}개 있습니다. 프로젝트 폴더에는 하나만 두는 것을 권장합니다.`,"error");return}
 if(masters.length===1){
  try{const m=JSON.parse(await masters[0].file.text());loadMaster(m);const missing=items.filter(x=>!resolveFile(x.audio));setProjectStatus(`✓ 기존 프로젝트 <b>${escapeHtml(m.experimentId)}</b>를 열었습니다.<br>✓ 문항 ${items.length}개 · 음성 ${files.size}개${missing.length?`<br>⚠ 찾지 못한 음성 ${missing.length}개`:""}`,missing.length?"error":"ok")}catch(e){setProjectStatus(`master JSON을 읽을 수 없습니다: ${escapeHtml(e.message)}`,"error")}
 }else{
  const names=[...files.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));const labels=parseOptionLabels($("defaultOptions").value);items=names.map((name,i)=>({id:`item_${String(i+1).padStart(4,"0")}`,audio:name,options:labelsToOptions(labels),answer:""}));renderItems();setProjectStatus(`✓ 새 프로젝트 폴더를 열었습니다.<br>✓ 음성파일 ${items.length}개를 읽었습니다. 정답을 지정한 뒤 <b>실험 저장</b>을 누르세요.`,"ok")
 }
}
function loadMaster(m){
 $("experimentId").value=m.experimentId||"experiment_01";$("title").value=m.title||"";$("instructions").value=m.instructions||"";$("randomize").checked=m.settings?.randomize!==false;$("allowUnrecognized").checked=m.settings?.allowUnrecognized!==false;
 items=(m.items||[]).map((x,i)=>({id:x.id||`item_${String(i+1).padStart(4,"0")}`,audio:x.audio,options:(x.options||[]).map(o=>({...o})),answer:x.answer==null?"":String(x.answer)}));renderItems();updateNames();
}
function renderItems(){
 const body=$("itemsBody");body.innerHTML="";if($("itemCountBadge"))$("itemCountBadge").textContent=`문항 ${items.length}개`;items.forEach((it,i)=>{const tr=document.createElement("tr");const opts=['<option value="">정답 선택</option>',...(it.options||[]).map(o=>`<option value="${escapeHtml(o.value)}" ${String(it.answer)===String(o.value)?"selected":""}>${escapeHtml(o.label)}</option>`)].join("");tr.innerHTML=`<td>${i+1}</td><td>${escapeHtml(it.audio)}</td><td><input type="text" data-options="${i}" value="${escapeHtml(itemOptionText(it))}"></td><td><select data-answer="${i}">${opts}</select></td><td><button class="ghost" data-play="${i}">▶ 듣기</button></td>`;body.appendChild(tr)});
 body.querySelectorAll("[data-options]").forEach(inp=>inp.onchange=e=>{const idx=+e.target.dataset.options;items[idx].options=labelsToOptions(parseOptionLabels(e.target.value));items[idx].answer="";renderItems()});
 body.querySelectorAll("[data-answer]").forEach(s=>s.onchange=e=>{items[+e.target.dataset.answer].answer=e.target.value;checkDesign()});
 body.querySelectorAll("[data-play]").forEach(b=>b.onclick=async e=>{const it=items[+e.target.dataset.play],f=resolveFile(it.audio);if(!f)return alert("음성파일을 찾을 수 없습니다.");const url=URL.createObjectURL(f),a=new Audio(url);await a.play();a.onended=()=>URL.revokeObjectURL(url)});checkDesign();
}
$("applyDefaultAll").onclick=()=>{if(!items.length)return alert("먼저 프로젝트 폴더를 여세요.");const labels=parseOptionLabels($("defaultOptions").value);if(!labels.length)return alert("기본 선택지를 입력하세요.");if(!confirm("모든 문항의 선택지를 기본 선택지로 바꾸고 기존 정답을 비울까요?"))return;items.forEach(it=>{it.options=labelsToOptions(labels);it.answer=""});renderItems()};
function settings(){return{randomize:$("randomize").checked,allowUnrecognized:$("allowUnrecognized").checked,unrecognizedValue:"0",unrecognizedLabel:"인식 불가"}}
function baseExperiment(includeAnswers){return{schemaVersion:3,experimentId:projectId(),title:$("title").value.trim(),instructions:$("instructions").value.trim(),settings:settings(),items:items.map(x=>{const o={id:x.id,audio:x.audio,options:(x.options||[]).map(y=>({...y}))};if(includeAnswers)o.answer=String(x.answer);return o})}}
function checkDesign(){if(!items.length){$("designCheck").textContent="프로젝트 폴더를 먼저 여세요.";$("designCheck").className="notice small";return false}const noOpt=items.filter(x=>!x.options?.length).length,noAns=items.filter(x=>x.answer==="").length,missingAudio=items.filter(x=>files.size&&!resolveFile(x.audio)).length;const ok=!noOpt&&!noAns&&!missingAudio;$("designCheck").textContent=ok?`✓ 문항 ${items.length}개 · 선택지 · 정답 · 음성파일 확인 완료`:`문항 ${items.length}개 · 선택지 없음 ${noOpt} · 정답 미지정 ${noAns}${missingAudio?` · 음성 누락 ${missingAudio}`:""}`;$("designCheck").className=`notice small ${ok?"ok":""}`;return ok}
async function writeJsonToProject(obj,name){
 const text=JSON.stringify(obj,null,2);
 if(projectDirHandle){try{const fh=await projectDirHandle.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(text);await w.close();setProjectStatus(`✓ 프로젝트 폴더에 <b>${escapeHtml(name)}</b>을 저장했습니다.`,"ok");return}catch(e){}}
 downloadJson(obj,name);setProjectStatus(`✓ <b>${escapeHtml(name)}</b>을 저장했습니다. 브라우저 다운로드 위치를 확인하세요.`,"ok");
}
$("saveMaster").onclick=async()=>{if(!checkDesign())return alert("모든 문항의 선택지·정답·음성을 확인하세요.");await writeJsonToProject(baseExperiment(true),masterName())};
$("saveParticipant").onclick=async()=>{if(!checkDesign())return alert("모든 문항의 선택지·정답·음성을 확인하세요.");await writeJsonToProject(baseExperiment(false),participantName())};
$("testExperiment").onclick=()=>{if(!checkDesign())return alert("먼저 실험 설계를 완성해 주세요.");showMainView("testView");const exp=baseExperiment(false),st=VoiceExperimentUtil.createState(exp,"DESIGNER_TEST");$("testCard").classList.remove("hidden");$("testComplete").classList.add("hidden");$("testCard").scrollIntoView({behavior:"smooth"});testRunner=new VoiceExperimentRunner($("testRunnerRoot"),{mode:"test",audioResolver:async p=>resolveFile(p),onStateChange:()=>{},onComplete:()=>$("testComplete").classList.remove("hidden"),onRestart:()=>{const s=VoiceExperimentUtil.createState(exp,"DESIGNER_TEST");testRunner.load(exp,s);testRunner.playCurrent(false)}});testRunner.load(exp,st);testRunner.playCurrent(false)};
$("closeTest").onclick=()=>showMainView("designView");

// ---- result analysis ----
async function chooseResults(){
 if(!items.length||items.some(x=>x.answer===""))return alert("결과 분석 전에 이 프로젝트의 master 정보(문항과 정답)를 먼저 여세요.");
 if(window.showOpenFilePicker&&window.isSecureContext){try{const hs=await window.showOpenFilePicker({multiple:true,types:[{description:"실험 결과 JSON",accept:{"application/json":[".json"]}}]});const entries=[];for(const h of hs){const f=await h.getFile();entries.push({name:f.name,data:JSON.parse(await f.text())})}runAnalysis(entries)}catch(e){if(e.name!=="AbortError")setAnalysisStatus(`결과 파일을 읽을 수 없습니다: ${escapeHtml(e.message)}`,"error")}}
 else{$("fallbackResults").value="";$("fallbackResults").click()}
}
$("fallbackResults").onchange=async e=>{const entries=[];for(const f of e.target.files){try{entries.push({name:f.name,data:JSON.parse(await f.text())})}catch(err){setAnalysisStatus(`${escapeHtml(f.name)}을 읽을 수 없습니다.`,"error")}}runAnalysis(entries)};
function setAnalysisStatus(html,kind=""){$("analysisStatus").className=`notice ${kind}`;$("analysisStatus").innerHTML=html;$("analysisStatus").classList.remove("hidden")}
function runAnalysis(entries){
 showMainView("analysisView");
 const master=baseExperiment(true);currentAnalysis=VoiceExperimentAnalysis.analyze(master,entries);const a=currentAnalysis;
 if(!a.acceptedCount){setAnalysisStatus(`집계 가능한 결과가 없습니다.${a.warnings.length?`<br>${a.warnings.map(escapeHtml).join("<br>")}`:""}`,"error");$("analysisArea").classList.add("hidden");return}
 setAnalysisStatus(`✓ 결과 ${a.acceptedCount}명 집계 완료${a.warnings.length?`<br>⚠ ${a.warnings.length}건 경고<br><div class="warning-list">${a.warnings.map(x=>escapeHtml(x)).join("<br>")}</div>`:""}`,a.warnings.length?"":"ok");
 $("analysisArea").classList.remove("hidden");$("kpiParticipants").textContent=a.acceptedCount;$("kpiItems").textContent=items.length;$("kpiResponses").textContent=a.rawRows.filter(x=>x.selectedValue!=="").length;$("kpiAccuracy").textContent=`${a.overallAccuracy}%`;
 renderParticipantStats(a.participantStats);renderProblemStats(a.problemStats);renderPronunciationStats(a.pronunciationStats);renderRaw(a.rawRows);
}
function tableHtml(headers,rows){return `<table class="result-table"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${escapeHtml(r[h.key]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table>`}

const participantSummaryHeaders=[{key:"participantId",label:"참가자"},{key:"totalQuestions",label:"전체 문항"},{key:"answered",label:"응답"},{key:"unanswered",label:"미응답"},{key:"correct",label:"정답"},{key:"incorrect",label:"오답"},{key:"unrecognized",label:"인식 불가"},{key:"accuracy",label:"정답률(%)"},{key:"avgResponseTimeMs",label:"평균 응답시간(ms)"},{key:"replayTotal",label:"다시 듣기"}];
const participantItemHeaders=[{key:"trial",label:"제시순서"},{key:"itemId",label:"문항 ID"},{key:"audio",label:"음성파일"},{key:"answerLabel",label:"정답"},{key:"selectedLabel",label:"사용자 선택"},{key:"correct",label:"점수"},{key:"unrecognized",label:"인식 불가"},{key:"responseTimeMs",label:"응답시간(ms)"},{key:"replayCount",label:"다시 듣기"},{key:"revisionCount",label:"답 수정"}];
const problemHeaders=[{key:"itemId",label:"문항 ID"},{key:"audio",label:"음성파일"},{key:"answerLabel",label:"정답"},{key:"participants",label:"참가자"},{key:"responses",label:"응답"},{key:"correct",label:"정답"},{key:"incorrect",label:"오답"},{key:"unrecognized",label:"인식 불가"},{key:"accuracy",label:"정답률(%)"},{key:"avgResponseTimeMs",label:"평균 응답시간(ms)"},{key:"replayTotal",label:"다시 듣기"},{key:"distribution",label:"응답 분포"}];
const providerHeaders=[{key:"provider",label:"음성 제공자"},{key:"itemCount",label:"문항 수"},{key:"audioCount",label:"음성파일 수"},{key:"participants",label:"참가자"},{key:"responses",label:"응답"},{key:"correct",label:"정답"},{key:"incorrect",label:"오답"},{key:"unrecognized",label:"인식 불가"},{key:"accuracy",label:"정답률(%)"},{key:"avgResponseTimeMs",label:"평균 응답시간(ms)"},{key:"replayTotal",label:"다시 듣기"},{key:"distribution",label:"응답 분포"}];

function renderParticipantStats(rows){
 const previous=selectedParticipantDetail;
 const ids=rows.map(r=>String(r.participantId));
 selectedParticipantDetail=ids.includes(previous)?previous:(ids[0]||"");
 $("participantTab").innerHTML=`
  <div style="padding:4px 0 18px"><h3 style="margin:0 0 10px">참가자별 요약 통계</h3>${tableHtml(participantSummaryHeaders,rows)}</div>
  <div style="border-top:1px solid #e6ebf2;padding-top:22px">
   <div class="toolbar" style="justify-content:space-between;margin-bottom:12px">
    <div><h3 style="margin:0">참가자 문항별 응답 상세</h3><p class="muted small" style="margin:4px 0 0">참가자를 선택하면 그 참가자의 각 문항 응답을 확인할 수 있습니다.</p></div>
    <label class="field" style="min-width:220px"><span>참가자 선택</span><select id="participantDetailSelect">${ids.map(id=>`<option value="${escapeHtml(id)}" ${id===selectedParticipantDetail?"selected":""}>${escapeHtml(id)}</option>`).join("")}</select></label>
   </div>
   <div id="participantDetailTable"></div>
  </div>`;
 const sel=$("participantDetailSelect");if(sel)sel.onchange=e=>{selectedParticipantDetail=e.target.value;renderParticipantDetail()};
 renderParticipantDetail();
}
function renderParticipantDetail(){
 const box=$("participantDetailTable");if(!box||!currentAnalysis)return;
 const rows=currentAnalysis.rawRows.filter(r=>String(r.participantId)===String(selectedParticipantDetail)).slice().sort((a,b)=>Number(a.trial||0)-Number(b.trial||0));
 box.innerHTML=tableHtml(participantItemHeaders,rows);
}

function renderProblemStats(rows){
 $("problemTab").innerHTML=`
  <div style="padding:4px 0 22px"><h3 style="margin:0 0 6px">음성 파일별 통계</h3><p class="muted small" style="margin:0 0 10px">각 음성 파일을 하나의 문제로 보고 집계합니다.</p>${tableHtml(problemHeaders,rows)}</div>
  <div style="border-top:1px solid #e6ebf2;padding-top:22px">
   <h3 style="margin:0 0 6px">음성 제공자별 통계</h3>
   <p class="muted small" style="margin:0 0 12px">음성파일명에서 제공자 ID를 추출해 같은 제공자의 음성을 묶어 집계합니다. 파일 확장자는 계산에서 제외합니다.</p>
   <div class="toolbar" style="gap:12px;align-items:end;margin-bottom:10px">
    <label class="field" style="min-width:260px"><span>제공자 인식 방식</span><select id="providerRuleType"><option value="prefix" ${providerRule.type==="prefix"?"selected":""}>앞에서 N글자 선택</option><option value="trimSuffix" ${providerRule.type==="trimSuffix"?"selected":""}>뒤에서 N글자 제외</option></select></label>
    <label class="field" style="width:140px"><span>글자 수 N</span><input id="providerRuleCount" type="number" min="0" step="1" value="${providerRule.count}"></label>
   </div>
   <div id="providerRulePreview" class="notice small" style="margin-bottom:12px"></div>
   <div id="providerStatsTable"></div>
  </div>`;
 const type=$("providerRuleType"),count=$("providerRuleCount");
 const update=()=>{providerRule.type=type.value;providerRule.count=Math.max(0,Math.floor(Number(count.value)||0));count.value=providerRule.count;renderProviderStats()};
 type.onchange=update;count.oninput=update;renderProviderStats();
}
function renderProviderStats(){
 if(!currentAnalysis)return;
 const stats=VoiceExperimentAnalysis.providerStats(currentAnalysis.rawRows,providerRule);
 const sample=currentAnalysis.rawRows.find(r=>r.audio)?.audio||"";
 const provider=VoiceExperimentAnalysis.extractProvider(sample,providerRule)||"(빈 값)";
 const preview=$("providerRulePreview");
 if(preview)preview.innerHTML=sample?`예시: <b>${escapeHtml(sample)}</b> → 음성 제공자 <b>${escapeHtml(provider)}</b>`:"분석할 음성파일이 없습니다.";
 const box=$("providerStatsTable");if(box)box.innerHTML=tableHtml(providerHeaders,stats);
}

function renderPronunciationStats(rows){$("pronunciationTab").innerHTML=tableHtml([{key:"pronunciation",label:"정답 발음"},{key:"itemCount",label:"묶인 문항 수"},{key:"audioCount",label:"음성파일 수"},{key:"participants",label:"참가자"},{key:"responses",label:"전체 응답"},{key:"correct",label:"정답"},{key:"incorrect",label:"오답"},{key:"unrecognized",label:"인식 불가"},{key:"accuracy",label:"정답률(%)"},{key:"avgResponseTimeMs",label:"평균 응답시간(ms)"},{key:"replayTotal",label:"다시 듣기"},{key:"distribution",label:"응답 분포"}],rows)}
function renderRaw(rows){$("rawTab").innerHTML=tableHtml([{key:"participantId",label:"참가자"},{key:"trial",label:"제시순서"},{key:"itemId",label:"문항 ID"},{key:"audio",label:"음성파일"},{key:"answerLabel",label:"정답"},{key:"selectedLabel",label:"사용자 선택"},{key:"correct",label:"정답여부"},{key:"unrecognized",label:"인식 불가"},{key:"replayCount",label:"다시 듣기"},{key:"responseTimeMs",label:"응답시간(ms)"},{key:"revisionCount",label:"답 수정"}],rows)}
document.querySelectorAll(".tabbtn").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabbtn").forEach(x=>x.classList.toggle("active",x===b));["participant","problem","pronunciation","raw"].forEach(t=>$(t+"Tab").classList.toggle("hidden",b.dataset.tab!==t))});
const rawHeaders=["프로젝트ID","실험명","참가자ID","결과파일","제시순서","문항ID","음성파일","정답값","정답","사용자선택값","사용자선택","정답여부","인식불가여부","다시듣기횟수","응답시간(ms)","답수정횟수","시작시간","완료시간"];
function rawArrays(){return [rawHeaders,...currentAnalysis.rawRows.map(r=>[r.projectId,r.experimentTitle,r.participantId,r.sourceFile,r.trial,r.itemId,r.audio,r.answerValue,r.answerLabel,r.selectedValue,r.selectedLabel,r.correct,r.unrecognized,r.replayCount,r.responseTimeMs,r.revisionCount,r.startedAt,r.completedAt])]}
$("exportXlsx").onclick=()=>{if(!currentAnalysis)return;if(!window.XLSX)return alert("Excel 저장 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV 저장을 사용하세요.");const ws=XLSX.utils.aoa_to_sheet(rawArrays());ws["!cols"]=[{wch:16},{wch:24},{wch:14},{wch:28},{wch:9},{wch:14},{wch:24},{wch:10},{wch:16},{wch:14},{wch:18},{wch:10},{wch:12},{wch:12},{wch:16},{wch:12},{wch:24},{wch:24}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"전체결과");XLSX.writeFile(wb,`${projectId()}_전체실험결과.xlsx`,{compression:true})};
$("exportCsv").onclick=()=>{if(!currentAnalysis)return;const csv=rawArrays().map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n");downloadBlob(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),`${projectId()}_전체실험결과.csv`)};

function showMainView(id){
 document.querySelectorAll(".main-view").forEach(v=>v.classList.toggle("hidden",v.id!==id));
 document.querySelectorAll(".main-nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.mainView===id));
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".main-nav-btn").forEach(b=>b.onclick=()=>showMainView(b.dataset.mainView));
$("openProjectFolder").onclick=openProjectFolder;$("openResults").onclick=chooseResults;$("experimentId").addEventListener("input",()=>{updateNames();checkDesign()});["title","instructions","randomize","allowUnrecognized"].forEach(id=>$(id).addEventListener("input",checkDesign));updateNames();checkDesign();
})();