
(() => {
  "use strict";

  class VoiceExperimentRunner {
    constructor(root, config = {}) {
      this.root = root;
      this.mode = config.mode || "participant";
      this.onStateChange = config.onStateChange || (() => {});
      this.onComplete = config.onComplete || (() => {});
      this.onRestart = config.onRestart || (() => {});
      this.audioResolver = config.audioResolver;
      this.experiment = null;
      this.state = null;
      this.audio = new Audio();
      this.objectUrl = null;
      this.renderShell();
      this.audio.addEventListener("ended", () => this.setAudioStatus("응답을 선택하세요."));
    }

    renderShell() {
      this.root.innerHTML = `
        <div class="runner-box">
          <div class="runner-mode ${this.mode === "test" ? "" : "hidden"}">TEST MODE · 실제 결과에 포함되지 않음</div>
          <div class="runner-head">
            <div>
              <h2 data-role="title"></h2>
              <p class="muted" data-role="instructions"></p>
            </div>
            <div class="progress" data-role="progress"></div>
          </div>
          <div class="audio-panel">
            <button class="secondary" data-action="replay">문제 다시 듣기</button>
            <span class="muted" data-role="audioStatus">음성 준비</span>
          </div>
          <div class="option-grid" data-role="options"></div>
          <button class="secondary wide" data-action="unrecognized">인식 불가</button>
          <div class="nav-row">
            <button class="ghost" data-action="previous">← 하나 전으로 올라가기</button>
            <button class="danger ghost" data-action="restart">처음부터 다시 시작</button>
          </div>
        </div>
      `;
      this.q('[data-action="replay"]').onclick = () => this.playCurrent(true);
      this.q('[data-action="previous"]').onclick = () => this.previous();
      this.q('[data-action="restart"]').onclick = () => this.onRestart();
      this.q('[data-action="unrecognized"]').onclick = () => {
        const s = this.experiment.settings || {};
        this.answer(String(s.unrecognizedValue ?? "0"), s.unrecognizedLabel || "인식 불가");
      };
    }

    q(sel){ return this.root.querySelector(sel); }

    load(experiment, state) {
      this.experiment = experiment;
      this.state = state;
      this.q('[data-role="title"]').textContent = experiment.title || "";
      this.q('[data-role="instructions"]').textContent = experiment.instructions || "";
      this.renderCurrent();
    }

    currentItem() {
      const id = this.state.order[this.state.currentIndex];
      return this.experiment.items.find(x => x.id === id);
    }

    itemOptions(item) {
      if (Array.isArray(item.options) && item.options.length) return item.options;
      // v0.2 이전 자료와의 임시 호환용. v0.3부터는 문항별 options가 표준이다.
      return Array.isArray(this.experiment.options) ? this.experiment.options : [];
    }

    renderCurrent() {
      if (this.state.currentIndex >= this.state.order.length) {
        this.onComplete(this.state);
        return;
      }
      const item = this.currentItem();
      const existing = this.state.responses[item.id];
      this.q('[data-role="progress"]').textContent = `${this.state.currentIndex + 1} / ${this.state.order.length}`;
      const optBox = this.q('[data-role="options"]');
      optBox.innerHTML = "";
      for (const opt of this.itemOptions(item)) {
        const b = document.createElement("button");
        b.className = "option-button";
        if (existing && String(existing.selectedValue) === String(opt.value)) b.classList.add("selected");
        b.textContent = opt.label;
        b.onclick = () => this.answer(String(opt.value), opt.label);
        optBox.appendChild(b);
      }
      const s = this.experiment.settings || {};
      this.q('[data-action="unrecognized"]').classList.toggle("hidden", s.allowUnrecognized === false);
      this.q('[data-action="unrecognized"]').textContent = s.unrecognizedLabel || "인식 불가";
      // 다시 듣기와 이전 문제는 모든 실험에서 고정 제공한다.
      this.q('[data-action="previous"]').disabled = this.state.currentIndex === 0;
      this.q('[data-action="replay"]').disabled = false;
    }

    async playCurrent(isReplay=false) {
      const item = this.currentItem();
      if (!item) return;
      const file = await this.audioResolver(item.audio);
      if (!file) {
        this.setAudioStatus(`음성파일 없음: ${item.audio}`);
        return;
      }
      const st = this.state.stats[item.id] || {replayCount:0, playCount:0, firstPlayAt:null};
      if (isReplay) st.replayCount++;
      st.playCount++;
      const now = Date.now();
      if (!st.firstPlayAt) st.firstPlayAt = now;
      st.lastPlayAt = now;
      this.state.stats[item.id] = st;
      this.onStateChange(this.state);

      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(file);
      this.audio.src = this.objectUrl;
      try {
        this.setAudioStatus(isReplay ? "다시 재생 중…" : "재생 중…");
        await this.audio.play();
      } catch {
        this.setAudioStatus("문제 다시 듣기를 눌러 재생해 주세요.");
      }
    }

    setAudioStatus(t){ this.q('[data-role="audioStatus"]').textContent = t; }

    answer(value, label) {
      const item = this.currentItem();
      if (!item) return;
      const st = this.state.stats[item.id] || {};
      const now = Date.now();
      const prev = this.state.responses[item.id];
      this.state.responses[item.id] = {
        itemId:item.id,
        audio:item.audio,
        selectedValue:value,
        selectedLabel:label,
        responseTimeMs: st.firstPlayAt ? Math.max(0, now-st.firstPlayAt) : null,
        replayCount: st.replayCount || 0,
        revisionCount: prev ? (prev.revisionCount || 0)+1 : 0,
        answeredAt:new Date(now).toISOString()
      };
      if (this.state.currentIndex >= this.state.order.length-1) {
        this.state.currentIndex = this.state.order.length;
        this.state.completedAt = new Date().toISOString();
        this.onStateChange(this.state);
        this.onComplete(this.state);
        return;
      }
      this.state.currentIndex++;
      this.onStateChange(this.state);
      this.renderCurrent();
      this.playCurrent(false);
    }

    previous() {
      if (this.state.currentIndex <= 0) return;
      this.state.currentIndex--;
      this.onStateChange(this.state);
      this.renderCurrent();
      this.playCurrent(true);
    }
  }

  window.VoiceExperimentRunner = VoiceExperimentRunner;

  window.VoiceExperimentUtil = {
    shuffle(arr) {
      const a = [...arr];
      for (let i=a.length-1; i>0; i--) {
        const j = Math.floor(Math.random()*(i+1));
        [a[i],a[j]] = [a[j],a[i]];
      }
      return a;
    },
    createState(experiment, participantId="TEST") {
      const ids = experiment.items.map(x=>x.id);
      const order = experiment.settings?.randomize === false ? ids : this.shuffle(ids);
      return {
        schemaVersion:1,
        experimentId:experiment.experimentId,
        participantId,
        startedAt:new Date().toISOString(),
        completedAt:null,
        order,
        currentIndex:0,
        responses:{},
        stats:{}
      };
    },
    validateParticipantExperiment(exp) {
      const e=[];
      if(!exp?.experimentId) e.push("experimentId가 없습니다.");
      if(!exp?.title) e.push("title이 없습니다.");
      if(!Array.isArray(exp?.items) || !exp.items.length) e.push("items가 없습니다.");
      if(Array.isArray(exp?.items)){
        const ids=new Set();
        exp.items.forEach((it,i)=>{
          if(!it.id) e.push(`${i+1}번 문항에 id가 없습니다.`);
          if(!it.audio) e.push(`${i+1}번 문항에 audio가 없습니다.`);
          if(it.answer !== undefined) e.push(`${i+1}번 문항에 answer가 포함되어 있습니다.`);
          const itemOptions = Array.isArray(it.options) && it.options.length ? it.options : (Array.isArray(exp.options) ? exp.options : []);
          if(!itemOptions.length) e.push(`${i+1}번 문항에 선택지가 없습니다.`);
          if(ids.has(it.id)) e.push(`중복 item id: ${it.id}`);
          ids.add(it.id);
        });
      }
      return e;
    }
  };
})();
