(() => {
  "use strict";
  const toStr = v => v == null ? "" : String(v);
  const round1 = n => Math.round(n * 10) / 10;

  function optionLabel(item, value, unrecognizedValue, unrecognizedLabel) {
    if (value == null || value === "") return "";
    if (String(value) === String(unrecognizedValue)) return unrecognizedLabel;
    const opt = (item.options || []).find(o => String(o.value) === String(value));
    return opt ? opt.label : String(value);
  }

  function analyze(master, resultFiles) {
    const warnings = [];
    const accepted = [];
    const seenParticipants = new Set();
    const itemMap = new Map((master.items || []).map(it => [String(it.id), it]));
    const audioMap = new Map((master.items || []).map(it => [String(it.audio).toLowerCase(), it]));
    const unrecognizedValue = String(master.settings?.unrecognizedValue ?? "0");
    const unrecognizedLabel = master.settings?.unrecognizedLabel || "인식 불가";

    for (const entry of resultFiles) {
      const r = entry.data;
      if (!r || r.resultType !== "voice-experiment-result") {
        warnings.push(`${entry.name}: 음성 실험 결과 JSON이 아닙니다.`); continue;
      }
      if (String(r.experimentId) !== String(master.experimentId)) {
        warnings.push(`${entry.name}: 프로젝트 ID가 다릅니다 (${r.experimentId || "없음"}).`); continue;
      }
      const pid = toStr(r.participantId).trim();
      if (!pid) { warnings.push(`${entry.name}: 참가자 번호가 없습니다.`); continue; }
      if (seenParticipants.has(pid)) {
        warnings.push(`${entry.name}: 참가자 ${pid}의 결과가 이미 포함되어 있어 제외했습니다.`); continue;
      }
      seenParticipants.add(pid);
      accepted.push(entry);
    }

    const problemAcc = new Map();
    for (const it of master.items || []) {
      const dist = {};
      for (const o of it.options || []) dist[o.label] = 0;
      if (master.settings?.allowUnrecognized !== false) dist[unrecognizedLabel] = 0;
      problemAcc.set(String(it.id), {
        itemId: it.id, audio: it.audio, answerValue: toStr(it.answer),
        answerLabel: optionLabel(it, it.answer, unrecognizedValue, unrecognizedLabel),
        responseCount:0, correct:0, incorrect:0, unrecognized:0, unanswered:0,
        rtValues:[], replayTotal:0, distribution:dist
      });
    }

    // 정답 발음(label)이 같은 문항들을 하나로 묶는 발음별 집계
    const pronunciationAcc = new Map();
    for (const it of master.items || []) {
      const answerLabel = optionLabel(it, it.answer, unrecognizedValue, unrecognizedLabel);
      const key = answerLabel || `(정답값 ${toStr(it.answer)})`;
      if (!pronunciationAcc.has(key)) {
        pronunciationAcc.set(key, {
          pronunciation:key, itemIds:new Set(), audioFiles:new Set(), participants:new Set(),
          responseCount:0, correct:0, incorrect:0, unrecognized:0,
          rtValues:[], replayTotal:0, distribution:{}
        });
      }
      const g = pronunciationAcc.get(key);
      g.itemIds.add(String(it.id));
      g.audioFiles.add(String(it.audio));
      for (const o of it.options || []) if (!(o.label in g.distribution)) g.distribution[o.label] = 0;
      if (master.settings?.allowUnrecognized !== false && !(unrecognizedLabel in g.distribution)) g.distribution[unrecognizedLabel] = 0;
    }

    const participantStats = [];
    const rawRows = [];

    for (const entry of accepted) {
      const r = entry.data;
      const responses = Array.isArray(r.responses) ? r.responses : [];
      const total = (master.items || []).length;
      let answered=0, correct=0, unrecognized=0, replayTotal=0;
      const rtValues=[];

      // result rows are retained in actual presentation order
      for (const resp of responses) {
        let item = itemMap.get(String(resp.itemId));
        if (!item && resp.audio != null) item = audioMap.get(String(resp.audio).toLowerCase());
        if (!item) {
          warnings.push(`${entry.name}: master에 없는 문항 ${resp.itemId || resp.audio || "?"}이 있어 제외했습니다.`);
          continue;
        }
        const selectedValue = resp.selectedValue == null ? "" : String(resp.selectedValue);
        const isAnswered = selectedValue !== "";
        const isUnrecognized = isAnswered && selectedValue === unrecognizedValue;
        const isCorrect = isAnswered && selectedValue === String(item.answer);
        const selectedLabel = resp.selectedLabel || optionLabel(item, selectedValue, unrecognizedValue, unrecognizedLabel);
        const answerLabel = optionLabel(item, item.answer, unrecognizedValue, unrecognizedLabel);
        const rt = Number.isFinite(Number(resp.responseTimeMs)) ? Number(resp.responseTimeMs) : null;
        const replays = Number.isFinite(Number(resp.replayCount)) ? Number(resp.replayCount) : 0;

        if (isAnswered) answered++;
        if (isCorrect) correct++;
        if (isUnrecognized) unrecognized++;
        if (rt != null && rt >= 0) rtValues.push(rt);
        replayTotal += replays;

        const pa = problemAcc.get(String(item.id));
        if (pa) {
          if (isAnswered) {
            pa.responseCount++;
            if (isCorrect) pa.correct++; else pa.incorrect++;
            if (isUnrecognized) pa.unrecognized++;
            if (!(selectedLabel in pa.distribution)) pa.distribution[selectedLabel || "기타"] = 0;
            pa.distribution[selectedLabel || "기타"]++;
          }
          if (rt != null && rt >= 0) pa.rtValues.push(rt);
          pa.replayTotal += replays;
        }

        const pronunciationKey = answerLabel || `(정답값 ${toStr(item.answer)})`;
        const ga = pronunciationAcc.get(pronunciationKey);
        if (ga) {
          ga.participants.add(toStr(r.participantId));
          if (isAnswered) {
            ga.responseCount++;
            if (isCorrect) ga.correct++; else ga.incorrect++;
            if (isUnrecognized) ga.unrecognized++;
            if (!(selectedLabel in ga.distribution)) ga.distribution[selectedLabel || "기타"] = 0;
            ga.distribution[selectedLabel || "기타"]++;
          }
          if (rt != null && rt >= 0) ga.rtValues.push(rt);
          ga.replayTotal += replays;
        }

        rawRows.push({
          projectId: master.experimentId,
          experimentTitle: master.title || "",
          participantId: r.participantId,
          sourceFile: entry.name,
          trial: resp.trial ?? "",
          itemId: item.id,
          audio: item.audio,
          answerValue: toStr(item.answer),
          answerLabel,
          selectedValue,
          selectedLabel,
          correct: isAnswered ? (isCorrect ? 1 : 0) : "",
          unrecognized: isUnrecognized ? 1 : 0,
          replayCount: replays,
          responseTimeMs: rt ?? "",
          revisionCount: Number.isFinite(Number(resp.revisionCount)) ? Number(resp.revisionCount) : 0,
          startedAt: r.stateStartedAt || r.startedAt || "",
          completedAt: r.completedAt || ""
        });
      }

      const incorrect = answered - correct;
      participantStats.push({
        participantId:r.participantId,
        totalQuestions:total,
        answered,
        unanswered:Math.max(0,total-answered),
        correct,
        incorrect,
        unrecognized,
        accuracy: answered ? round1(correct/answered*100) : 0,
        avgResponseTimeMs:rtValues.length ? Math.round(rtValues.reduce((a,b)=>a+b,0)/rtValues.length) : "",
        replayTotal,
        sourceFile:entry.name
      });
    }

    const participantCount = accepted.length;
    const problemStats = [...problemAcc.values()].map(p => {
      p.unanswered = Math.max(0, participantCount - p.responseCount);
      return {
        itemId:p.itemId,
        audio:p.audio,
        answerValue:p.answerValue,
        answerLabel:p.answerLabel,
        participants:participantCount,
        responses:p.responseCount,
        unanswered:p.unanswered,
        correct:p.correct,
        incorrect:p.incorrect,
        unrecognized:p.unrecognized,
        accuracy:p.responseCount ? round1(p.correct/p.responseCount*100) : 0,
        avgResponseTimeMs:p.rtValues.length ? Math.round(p.rtValues.reduce((a,b)=>a+b,0)/p.rtValues.length) : "",
        replayTotal:p.replayTotal,
        distribution:Object.entries(p.distribution).map(([k,v])=>`${k}: ${v}`).join(" / ")
      };
    });

    const pronunciationStats = [...pronunciationAcc.values()].map(g => ({
      pronunciation:g.pronunciation,
      itemCount:g.itemIds.size,
      audioCount:g.audioFiles.size,
      participants:g.participants.size,
      responses:g.responseCount,
      correct:g.correct,
      incorrect:g.incorrect,
      unrecognized:g.unrecognized,
      accuracy:g.responseCount ? round1(g.correct/g.responseCount*100) : 0,
      avgResponseTimeMs:g.rtValues.length ? Math.round(g.rtValues.reduce((a,b)=>a+b,0)/g.rtValues.length) : "",
      replayTotal:g.replayTotal,
      distribution:Object.entries(g.distribution).map(([k,v])=>`${k}: ${v}`).join(" / ")
    })).sort((a,b)=>String(a.pronunciation).localeCompare(String(b.pronunciation), undefined, {numeric:true}));

    const answeredAll = participantStats.reduce((s,x)=>s+x.answered,0);
    const correctAll = participantStats.reduce((s,x)=>s+x.correct,0);
    const overallAccuracy = answeredAll ? round1(correctAll/answeredAll*100) : 0;
    return {warnings, acceptedCount:accepted.length, participantStats, problemStats, pronunciationStats, rawRows, overallAccuracy};
  }


  // 음성파일명에서 음성 제공자 ID를 추출한다.
  // rule.type: "prefix" = 확장자 제외 후 앞 N글자
  //            "trimSuffix" = 확장자 제외 후 뒤 N글자를 제거한 나머지
  function extractProvider(audio, rule={type:"prefix", count:3}) {
    const fileName = toStr(audio).replaceAll("\\", "/").split("/").pop() || "";
    const dot = fileName.lastIndexOf(".");
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
    const chars = Array.from(stem);
    const n = Math.max(0, Math.floor(Number(rule?.count) || 0));
    if (rule?.type === "trimSuffix") {
      return chars.slice(0, Math.max(0, chars.length - n)).join("");
    }
    return chars.slice(0, n || chars.length).join("");
  }

  function providerStats(rawRows, rule={type:"prefix", count:3}) {
    const acc = new Map();
    for (const row of rawRows || []) {
      const provider = extractProvider(row.audio, rule) || "(빈 값)";
      if (!acc.has(provider)) {
        acc.set(provider, {
          provider,
          participants:new Set(), itemIds:new Set(), audioFiles:new Set(),
          responses:0, correct:0, incorrect:0, unrecognized:0,
          rtValues:[], replayTotal:0, distribution:{}
        });
      }
      const g = acc.get(provider);
      g.participants.add(toStr(row.participantId));
      g.itemIds.add(toStr(row.itemId));
      g.audioFiles.add(toStr(row.audio));

      const answered = row.selectedValue != null && toStr(row.selectedValue) !== "";
      if (answered) {
        g.responses++;
        if (Number(row.correct) === 1) g.correct++; else g.incorrect++;
        if (Number(row.unrecognized) === 1) g.unrecognized++;
        const label = toStr(row.selectedLabel) || "기타";
        g.distribution[label] = (g.distribution[label] || 0) + 1;
      }
      const rt = Number(row.responseTimeMs);
      if (answered && Number.isFinite(rt) && rt >= 0) g.rtValues.push(rt);
      const replay = Number(row.replayCount);
      if (Number.isFinite(replay)) g.replayTotal += replay;
    }

    return [...acc.values()].map(g => ({
      provider:g.provider,
      itemCount:g.itemIds.size,
      audioCount:g.audioFiles.size,
      participants:g.participants.size,
      responses:g.responses,
      correct:g.correct,
      incorrect:g.incorrect,
      unrecognized:g.unrecognized,
      accuracy:g.responses ? round1(g.correct/g.responses*100) : 0,
      avgResponseTimeMs:g.rtValues.length ? Math.round(g.rtValues.reduce((a,b)=>a+b,0)/g.rtValues.length) : "",
      replayTotal:g.replayTotal,
      distribution:Object.entries(g.distribution).map(([k,v])=>`${k}: ${v}`).join(" / ")
    })).sort((a,b)=>String(a.provider).localeCompare(String(b.provider), undefined, {numeric:true}));
  }


  // 참가자 × 정답 발음별 통계
  function participantPronunciationStats(rawRows) {
    const acc = new Map();
    for (const row of rawRows || []) {
      const participantId = toStr(row.participantId) || "(참가자 없음)";
      const pronunciation = toStr(row.answerLabel) || `(정답값 ${toStr(row.answerValue)})`;
      const key = `${participantId}\u0000${pronunciation}`;
      if (!acc.has(key)) {
        acc.set(key, {
          participantId, pronunciation,
          itemIds:new Set(), audioFiles:new Set(), totalRows:0,
          responses:0, correct:0, incorrect:0, unrecognized:0,
          rtValues:[], replayTotal:0, distribution:{}
        });
      }
      const g = acc.get(key);
      g.totalRows++;
      g.itemIds.add(toStr(row.itemId));
      g.audioFiles.add(toStr(row.audio));
      const answered = row.selectedValue != null && toStr(row.selectedValue) !== "";
      if (answered) {
        g.responses++;
        if (Number(row.correct) === 1) g.correct++; else g.incorrect++;
        if (Number(row.unrecognized) === 1) g.unrecognized++;
        const label = toStr(row.selectedLabel) || "기타";
        g.distribution[label] = (g.distribution[label] || 0) + 1;
        const rt = Number(row.responseTimeMs);
        if (Number.isFinite(rt) && rt >= 0) g.rtValues.push(rt);
      }
      const replay = Number(row.replayCount);
      if (Number.isFinite(replay)) g.replayTotal += replay;
    }
    return [...acc.values()].map(g => ({
      participantId:g.participantId,
      pronunciation:g.pronunciation,
      itemCount:g.itemIds.size,
      audioCount:g.audioFiles.size,
      responses:g.responses,
      unanswered:Math.max(0, g.totalRows - g.responses),
      correct:g.correct,
      incorrect:g.incorrect,
      unrecognized:g.unrecognized,
      accuracy:g.responses ? round1(g.correct/g.responses*100) : 0,
      avgResponseTimeMs:g.rtValues.length ? Math.round(g.rtValues.reduce((a,b)=>a+b,0)/g.rtValues.length) : "",
      replayTotal:g.replayTotal,
      distribution:Object.entries(g.distribution).map(([k,v])=>`${k}: ${v}`).join(" / ")
    })).sort((a,b)=>{
      const p = String(a.participantId).localeCompare(String(b.participantId), undefined, {numeric:true});
      return p || String(a.pronunciation).localeCompare(String(b.pronunciation), undefined, {numeric:true});
    });
  }

  // 음성 제공자 × 정답 발음별 통계
  function providerPronunciationStats(rawRows, rule={type:"prefix", count:3}) {
    const acc = new Map();
    for (const row of rawRows || []) {
      const provider = extractProvider(row.audio, rule) || "(빈 값)";
      const pronunciation = toStr(row.answerLabel) || `(정답값 ${toStr(row.answerValue)})`;
      const key = `${provider}\u0000${pronunciation}`;
      if (!acc.has(key)) {
        acc.set(key, {
          provider, pronunciation,
          participants:new Set(), itemIds:new Set(), audioFiles:new Set(), totalRows:0,
          responses:0, correct:0, incorrect:0, unrecognized:0,
          rtValues:[], replayTotal:0, distribution:{}
        });
      }
      const g = acc.get(key);
      g.totalRows++;
      g.participants.add(toStr(row.participantId));
      g.itemIds.add(toStr(row.itemId));
      g.audioFiles.add(toStr(row.audio));
      const answered = row.selectedValue != null && toStr(row.selectedValue) !== "";
      if (answered) {
        g.responses++;
        if (Number(row.correct) === 1) g.correct++; else g.incorrect++;
        if (Number(row.unrecognized) === 1) g.unrecognized++;
        const label = toStr(row.selectedLabel) || "기타";
        g.distribution[label] = (g.distribution[label] || 0) + 1;
        const rt = Number(row.responseTimeMs);
        if (Number.isFinite(rt) && rt >= 0) g.rtValues.push(rt);
      }
      const replay = Number(row.replayCount);
      if (Number.isFinite(replay)) g.replayTotal += replay;
    }
    return [...acc.values()].map(g => ({
      provider:g.provider,
      pronunciation:g.pronunciation,
      itemCount:g.itemIds.size,
      audioCount:g.audioFiles.size,
      participants:g.participants.size,
      responses:g.responses,
      unanswered:Math.max(0, g.totalRows - g.responses),
      correct:g.correct,
      incorrect:g.incorrect,
      unrecognized:g.unrecognized,
      accuracy:g.responses ? round1(g.correct/g.responses*100) : 0,
      avgResponseTimeMs:g.rtValues.length ? Math.round(g.rtValues.reduce((a,b)=>a+b,0)/g.rtValues.length) : "",
      replayTotal:g.replayTotal,
      distribution:Object.entries(g.distribution).map(([k,v])=>`${k}: ${v}`).join(" / ")
    })).sort((a,b)=>{
      const p = String(a.provider).localeCompare(String(b.provider), undefined, {numeric:true});
      return p || String(a.pronunciation).localeCompare(String(b.pronunciation), undefined, {numeric:true});
    });
  }

  window.VoiceExperimentAnalysis = { analyze, extractProvider, providerStats, participantPronunciationStats, providerPronunciationStats };
})();