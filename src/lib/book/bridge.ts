/** Local wrapper only: upstream HTML and its source repository stay untouched. */
export function withBookBridge(html: string, revision: string): string {
  const script = `<script>
(() => {
 const revision = ${JSON.stringify(revision)};
 const channel = 'utils-book';
 const send = data => parent.postMessage({channel, revision, ...data}, location.origin);
 const anchors = [...document.querySelectorAll('.card[id]')].map(el => el.id);
 send({type:'ready', anchors});
 let selecting=false, selectionTimer;
 const publishSelection = () => {
   const selected = getSelection();
   const text = selected?.toString().trim() || '';
   const node = selected?.anchorNode;
   const card = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.card');
   const focus = selected?.focusNode;
   const endCard = (focus?.nodeType === 1 ? focus : focus?.parentElement)?.closest('.card');
   if(text && card && card === endCard) send({type:'selection',text:text.slice(0,2000),anchor:card.id,truncated:text.length>2000});
 };
 const queueSelection = () => { clearTimeout(selectionTimer); selectionTimer=setTimeout(publishSelection,200); };
 document.addEventListener('pointerdown', () => { selecting=true; clearTimeout(selectionTimer); });
 for(const event of ['pointerup','pointercancel']) document.addEventListener(event, () => { selecting=false; queueSelection(); });
 document.addEventListener('selectionchange', () => { if(!selecting) queueSelection(); });
 document.addEventListener('keyup', queueSelection);
 addEventListener('message', event => {
   const data = event.data;
   if(event.origin !== location.origin || event.source !== parent || !data || data.channel !== channel) return;
   if(data.type === 'init') { send({type:'ready', anchors}); return; }
   if(data.revision !== revision) return;
   if(data.type === 'theme' && ['dark','light'].includes(data.theme)) document.documentElement.classList.toggle('dark',data.theme === 'dark');
   if(data.type === 'navigate' && typeof data.anchor === 'string' && anchors.includes(data.anchor)) {
     const target = document.getElementById(data.anchor);
     if(!target.offsetParent && typeof state !== 'undefined' && typeof apply === 'function') {
       state.q=''; for(const dimension of DIMS) state[dimension].clear();
       state.dispute=false; state.todo=false; syncControls(); apply();
     }
     history.replaceState(null,'','#'+data.anchor);
     if(typeof scrollToEl === 'function') scrollToEl(target,{align:'start'});
     else target.scrollIntoView({block:'start'});
     send({type:'navigated', anchor:data.anchor});
   }
 });
})();
</script>`;
  return html.replace(/<\/body>/i, `${script}</body>`);
}
