"""Compare active field, atlas and tracked first-leg previews for quest-controlled gates."""
import json
import os
from urllib.parse import urljoin, urlparse, parse_qs

from playwright.sync_api import sync_playwright
from runtime import ROOT, native, runtime

graph = json.loads((ROOT/'content/story-graph.json').read_bytes())
checkpoint = json.loads((ROOT/'evidence/remaining-survey-save.json').read_bytes())
lua, core = runtime()
base = os.getenv('LAB_URL', 'http://127.0.0.1:19744/')
with sync_playwright() as driver:
    browser = driver.chromium.launch(channel='chrome')
    preview = browser.new_page()
    runner = browser.new_page()
    runner.goto(urljoin(base, 'content/story-graph.json'))
    runner.evaluate("async()=>{window.graph=await (await fetch(location.href)).json()}")
    for node in graph['nodes']:
        for edge in node['exits']:
            if not any(edge.get(k) for k in ('routeFixture','rockSeal','ironGate','rubbleOnClosed')):
                continue
            rule = edge['requires']
            for opened in (False, True):
                state = core.restore(lua.table_from(checkpoint, recursive=True), 12)
                core.enterStoryNode(state, node['id'])
                progress = state.story.quests[rule['quest']]
                progress.status = 'active'
                progress.count = rule['count'] if opened else rule.get('before', 0)
                core.action(state, 'world_map_focus:'+node['id'])
                frame = core.frame(state, 'sprite', 'legacy')
                portals = native(frame.storyPortals)
                current = next(p for p in portals if p.get('gateX')==edge['x'] and p['to']==edge['to'])
                atlas = next(p for p in native(frame.worldMap.routes) if p['previewX']==edge['x'] and p['id']==edge['to'])
                assert current['sealState']==atlas['sealState']==('open' if opened else 'closed'),node['id']
                if not opened:
                    continue
                guide = runner.evaluate("""async({story,portals,to})=>{
                  const {questRoute}=await import('/quest-route.js');
                  const visit={kind:'itinerary',itinerary:[{kind:'arrive',from:story.node,node:to}]};
                  return questRoute({story,storyPortals:portals,storyGraph:graph,progression:{level:200}},visit,'active')
                }""", {'story':native(frame.story),'portals':portals,'to':edge['to']})
                url = urljoin(base, guide['gateUrl'])
                query = parse_qs(urlparse(url).query)
                assert query['fixture']==['open'] and query['gateX']==[str(edge['x'])],url
                preview.goto(url)
                preview.wait_for_function('()=>window.mapArt?.ready')
                if edge.get('ironGate'):
                    assert int(preview.locator('#questPropStage').input_value())>0
                else:
                    assert preview.locator('#fixtureState').is_checked(),url
            print(node['id'], edge['to'], 'field/atlas closed and open; tracked open preview')
    browser.close()
