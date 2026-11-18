const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), vue = require('vue')
const compilerOptions = {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
const docs = {exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/conflictDocument.ts','utf8'),{compilerOptions}).outputText,docs)
const detail = fields => ({text:true,property:false,tree:false,working:'before\n<<<<<<< mine\nlocal\n=======\nincoming\n>>>>>>> theirs\nafter\n',incoming:'before\nincoming\nafter\n',local:null,properties:[],...fields})
const flush = async () => {await vue.nextTick();await Promise.resolve();await vue.nextTick()}
function harness(api) {
  const props=vue.reactive({workspace:'/wc',file:'a.ts'})
  const store=vue.reactive({statusIsStale:false})
  const mocks={vue:{...vue,onBeforeUnmount(){}},'vue-i18n':{useI18n:()=>({t:key=>key})},'@/api/svn':{svnConflictDetails:api},'@/utils/conflictDocument':docs.exports,'@/stores/workspace':{useWorkspaceStore:()=>store}}
  const context={exports:{},defineProps:()=>props,defineEmits:()=>()=>{},require:key=>{assert.ok(key in mocks,key);return mocks[key]}}
  const source=fs.readFileSync('src/components/ConflictPreview.vue','utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const scope=vue.effectScope()
  scope.run(()=>vm.runInNewContext(ts.transpileModule(source+'\nexports.preview={details,incoming,local,readable,mode,propertyIndex};',{compilerOptions}).outputText,context))
  return {...context.exports.preview,props,stop:()=>scope.stop()}
}
test('read-only preview compares incoming against current local content without SVN markers',async()=>{
  const h=harness(async()=>detail());await flush()
  assert.equal(h.local.value,'before\nlocal\nafter\n')
  assert.equal(h.incoming.value,'before\nincoming\nafter\n')
  assert.equal(h.readable.value,true)
  h.stop()
})
test('late conflict loads cannot show the previous file and unknown property values are not guessed',async()=>{
  let finish
  const h=harness(async(_,file)=>file==='a.ts'?new Promise(resolve=>{finish=resolve}):detail({text:false,property:true,working:null,properties:[{name:'unknown',incoming_known:false,local:'local',incoming:null}]}))
  h.props.file='b.ts';await flush();assert.equal(h.mode.value,'property');assert.equal(h.readable.value,false)
  finish(detail());await flush();assert.equal(h.mode.value,'property');assert.equal(h.readable.value,false)
  h.stop()
})
