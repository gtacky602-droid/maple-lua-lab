"""Exercise all eight starter rewards from one earned adventure checkpoint."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

from runtime import ROOT, native, runtime
from savegame import validate_save


def replay(source, output):
    raw = source.read_bytes()
    earned = validate_save(json.loads(raw))
    assert earned['progression']['level'] == 200
    starters = [item for item in json.loads((ROOT/'content/weapon-settings.json').read_bytes())['items']
                if item.get('bound') not in (None, 'traveler')]
    quests = {q['id']:q for q in json.loads((ROOT/'content/story-graph.json').read_bytes())['quests']}
    lua, core = runtime()

    def restore(snapshot):
        state = core.restore(lua.table_from(validate_save(snapshot), recursive=True),12)
        assert state
        return state

    def save(state):
        return validate_save(native(core.checkpoint(state)))

    def select(state, item):
        core.action(state,'story_select_joined:'+item['quest'])

    def frame(state):
        return core.frame(state,'sprite','legacy')

    # Select and save each rewarded companion from the same earned adventure.
    state = restore(earned)
    assert state.progression.level == 200
    original = state.progression.total,state.mora
    records = {}
    for item in starters:
        owner, key, quest = item['bound'],item['id'],item['quest']
        assert state.story.quests[quest].status == 'complete'
        select(state,item)
        f = frame(state)
        assert f.storyJoined[owner] and f.companion.id==owner
        assert f.weaponView.partner==key and core.canEquipWeapon(state,owner,key)
        assert f.starterEquipment.weapon.name==item['name']
        assert f.starterEquipment.flower.hp==10
        assert state.progression.level==200 and len(state.actors)==2
        count = len(state.inventory['items'])
        core.action(state,'party_preset_store:1')
        snapshot = save(state)
        state = restore(snapshot)
        assert save(state)['partyPresets']==snapshot['partyPresets']
        core.action(state,'party_preset_apply:1')
        assert frame(state).weaponView.partner==key
        assert frame(state).companion.id==owner and len(state.inventory['items'])==count
        records[owner]=dict(quest=quest,weapon=key,flower=f.starterEquipment.flower.name,
                            equippedFlowerUsed=not f.starterEquipment.useFlower,
                            savedSelection=save(state)['companion'])
    assert (state.progression.total,state.mora)==original
    assert save(state)['story']['quests']==earned['story']['quests']
    (output/'companion-earned-roster-save.json').write_text(json.dumps(save(state),ensure_ascii=False)+'\n','utf8')

    # Reuse earned objectives in independent pre-report fixtures. These copies
    # exercise the reporting boundary without pretending to replay the quests.
    for item in starters:
        owner, key, quest = item['bound'],item['id'],item['quest']
        trial = restore(earned)
        core.enterStoryNode(trial,quests[quest]['hub'])
        progress = trial.story.quests[quest]
        progress.status,progress.cycles='active',0
        alternate = next(other for other in starters if other['bound']!=owner)
        select(trial,alternate)
        assert (trial.companion or 'amber')==alternate['bound']
        select(trial,item)
        assert (trial.companion or 'amber')==alternate['bound']
        assert not frame(trial).storyJoined[owner]
        assert not core.canEquipWeapon(trial,owner,key)
        assert not core.starterEquipment(trial,owner)

        totals = trial.progression.questXp,trial.mora
        core.action(trial,'story_report:'+quest)
        awarded = trial.progression.questXp,trial.mora
        assert all(new>old for old,new in zip(totals,awarded))
        core.action(trial,'story_report:'+quest)
        assert (trial.progression.questXp,trial.mora)==awarded
        select(trial,item)
        assert frame(trial).companion.id==owner and frame(trial).weaponView.partner==key
        assert frame(trial).starterEquipment.flower.hp==10
        assert core.canEquipWeapon(restore(save(trial)),owner,key)
        for artifact in trial.inventory['items'].values():
            if artifact.owner==2 and artifact.companionId==owner:
                core.action(trial,'artifact_remove:'+str(artifact.id))
        assert frame(trial).starterEquipment.useFlower
        assert trial.actors[2].maxhp==150
        assert restore(save(trial)).actors[2].maxhp==150
        records[owner]['maxHpWithStarterFlowerOnly'] = trial.actors[2].maxhp
        records[owner]['report'] = dict(xp=awarded[0]-totals[0],mora=awarded[1]-totals[1],
                                         repeatedReward=False)

    return dict(sourceSha256=sha256(raw).hexdigest(),level=200,companions=records,
                reportFixtures='Earned objectives retained; each target quest reopened only in a disposable Lua session.',
                earnedQuestsRetained=True,partyPresetsRestored=True)


if __name__=='__main__':
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--from-save',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    evidence=replay(args.from_save,args.output_dir)
    (args.output_dir/'companion-starters-lua.json').write_text(
        json.dumps(evidence,ensure_ascii=False,indent=2)+'\n','utf8')
    print(f"{len(evidence['companions'])} earned companions selected, restored, and checked at the report boundary.")
