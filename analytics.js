(() => {
  const endpoint = String(window.PARAN_USAGE_ENDPOINT || "").trim();

  function enabled(){
    return endpoint && !endpoint.includes("PASTE_") && /^https:\/\//i.test(endpoint);
  }

  async function projectOpen(app){
    if(!enabled()) return;
    const appType = app === "designer" ? "designer" : "participant";
    try{
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify({
          event: "project_open",
          app: appType
        })
      });
    }catch(_){
      // 사용량 집계 실패가 실험 기능에 영향을 주지 않도록 무시합니다.
    }
  }

  window.ParanUsage = { projectOpen };
})();
