"""Verify shared heat, cooling, and attack windows in the two Atocpan arenas."""
import json
import math

from runtime import ROOT, native, runtime
from test_coop_anemo import place, wait_cast
from test_coop_inazuma_flight import check_adoption, place_all
from test_coop_local import lab
from test_coop_oceanid_maguu import check_http, finish, hits, share
from test_coop_sumeru_field import attack


LAVA = ('boss-26270301', 'natlan-hub', 'natlan-field', 'lava-dragon-commission')
OVERSEER = ('boss-24090501', 'natlan-hub', 'atocpan-lava-field', 'overseer-commission')


def centers(cast):
    return [(band[1]+band[2])/2 for band in cast.bounds.values()]


def check_lava(lua, core):
    room, states, step = share(core,LAVA)
    host,guest,*_ = states
    slot=room.fieldSlot
    boss=slot.enemy
    assert boss.maxhp==1100 and boss.form=='rock'
    place_all(states,boss.x,(-94,-103,163,240))
    wait_cast(step,slot,'FLD01',122)
    assert [hits(s,boss) for s in states]==[[22],[22],[],[]]

    wait_cast(step,slot,'FLD02',54)
    fissures=centers(slot.cast)
    place(host,fissures[0])
    place(guest,fissures[1])
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FLD02',187)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[21],[21],[],[]]
    first=lua.table_from(dict(id=1,atk=20,x=boss.x,y=480,dir=1,radial=True,range=140,
                             limit=1,mult=1,element='pyro',color='#fff0ac',gain=0,critRate=0))
    core.resolveCast(host,first)
    core.resolveCast(host,first)
    attack(lua,core,guest,boss,element='pyro',reaction=True)
    assert boss.form=='rock' and boss.lavaHeat==1
    assert attack(lua,core,guest,boss,element='pyro')==19
    assert boss.form=='molten' and boss.lavaHeat==2 and boss.aura.element=='pyro'
    assert all(lua.eval('rawequal')(s.enemies[1],boss) for s in states)

    place_all(states,boss.x,(-93,-101,162,234))
    wait_cast(step,slot,'FLD03',54)
    lunge=slot.cast
    place_all(states,lunge.origin,(73*lunge.dir,lunge.dest-lunge.origin,-125*lunge.dir,-235*lunge.dir))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FLD03',133)
    assert boss.x==lunge.dest and [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[27],[27],[],[]]

    place_all(states,boss.x,(-88,-94,160,225))
    wait_cast(step,slot,'FLD04',60)
    points=centers(slot.cast)
    place(host,points[0])
    place(guest,points[1])
    place(states[2],min(points)-130)
    place(states[3],max(points)+135)
    marks=[s.seq for s in states]
    for s in states:
        frame=core.frame(s,'sprite')
        assert native(frame.fieldBoss.eruptionPoints)==points and frame.fieldBoss.lavaHeat.level==2
        labels=[d for d in frame.draws.values() if d.text in ('1','2') and d.color=='#fff1be']
        assert [(d.text,d.y) for d in labels]==[('1',501),('2',501)]
        assert all(math.isclose(d.x+frame.camera,x) for d,x in zip(labels,points))
    wait_cast(step,slot,'FLD04',209)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[31],[31],[],[]]
    for s in states:
        s.actors[1].hp=s.actors[1].maxhp
    place_all(states,boss.x,(-88,-93,143,231))
    wait_cast(step,slot,'FLD04',180)
    pending=slot.cast
    place(host,centers(pending)[1])
    mark=host.seq
    attack(lua,core,host,boss,element='pyro')
    attack(lua,core,guest,boss,element='pyro')
    assert boss.form=='overburn' and boss.lavaHeat==4 and slot.cast is None
    assert attack(lua,core,host,boss)==23
    for _ in range(179):
        step()
    assert boss.form=='overburn' and boss.overburnTicks==1 and hits(host,boss,mark)==[]
    step()
    assert boss.form=='rock' and boss.lavaHeat==0
    for s in (host,guest,host,guest):
        attack(lua,core,s,boss,element='pyro')
    assert boss.form=='overburn'
    attack(lua,core,guest,boss,element='hydro')
    assert boss.form=='rock' and boss.overburnTicks==0
    finish(lua,core,LAVA,slot,states)
    check_adoption(core,LAVA,'FLD01',108,22)
    return dict(participants=4,hp=1100,sameReceiverAndAura=True,distinctPlayerCastsShareHeat=True,
                repeatAndReactionCannotHeat=True,sharedEruptionPoints=True,independentAreaHits=True,
                overburnCancelsPendingEruption=True,timeoutAndWaterCool=True,individualRewards=True)


def check_overseer(lua, core):
    room,states,step=share(core,OVERSEER)
    host,guest,observer,_=states
    slot=room.fieldSlot
    boss=slot.enemy
    assert boss.maxhp==1125
    place_all(states,boss.x,(-94,-103,164,228))
    wait_cast(step,slot,'FOV01',263)
    assert [hits(s,boss) for s in states]==[[17,17,17],[17,17,17],[],[]]

    wait_cast(step,slot,'FOV02',54)
    wave=slot.cast
    place_all(states,wave.origin,(wave.first-wave.origin,wave.last-wave.origin,-103*wave.dir,-227*wave.dir))
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FOV02',124)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[23],[],[],[]]
    for s in states:
        frame=core.frame(s,'sprite')
        assert frame.fieldBoss.waveX==wave.waveX
        crest=next(d for d in frame.draws.values() if d.source=='overseer-field-poses-source-v1.png' and d.y==480)
        assert math.isclose(crest.x+frame.camera,wave.waveX)
    wait_cast(step,slot,'FOV02',151)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[23],[23],[],[]]

    place_all(states,boss.x,(-91,-95,146,231))
    wait_cast(step,slot,'FOV03',60)
    purge=slot.cast
    points=native(purge.centers)
    place(host,points[0])
    place(guest,points[1])
    place(observer,points[2])
    place(states[3],max(points)+180)
    marks=[s.seq for s in states]
    wait_cast(step,slot,'FOV03',300)
    assert [hits(s,boss,mark) for s,mark in zip(states,marks)]==[[24],[27],[],[]]
    assert purge.flow==4
    attack(lua,core,host,boss,element='cryo',reaction=True)
    assert purge.flow==4 and purge.chilled==0
    chill=lua.table_from(dict(id=1,atk=20,x=boss.x,y=480,dir=1,radial=True,range=140,
                             limit=1,mult=1,element='cryo',color='#fff0ac',gain=0,critRate=0))
    core.resolveCast(host,chill)
    core.resolveCast(host,chill)
    assert purge.flow==3 and purge.chilled==72
    wait_cast(step,slot,'FOV03',308)
    attack(lua,core,guest,boss,element='cryo')
    wait_cast(step,slot,'FOV03',331)
    assert purge.flow==2 and purge.chilled==49 and boss.form=='cooled'
    for s in states:
        view=core.frame(s,'sprite').fieldBoss
        assert native(view.purgePoints)==points and native(view.flow)=={'level':2,'max':5,'chilledTicks':49}
    wait_cast(step,slot,'FOV03',333)
    assert purge.damage[3]==24 and hits(observer,boss,marks[2])==[24]
    attack(lua,core,host,boss,element='cryo')
    assert purge.flow==1 and purge.damage[3]==24
    place(guest,points[2])
    wait_cast(step,slot,'FOV03',341)
    assert hits(guest,boss,marks[1])==[27,24]
    finish(lua,core,OVERSEER,slot,states)
    check_adoption(core,OVERSEER,'FOV01',108,17)
    return dict(participants=4,hp=1125,threeBladeWindowsPerPlayer=True,matchingMovingWave=True,
                sharedPurgePointsAndFlow=True,separateCryoCastersReduceSameMeter=True,
                repeatAndReactionCannotCool=True,activeJetDamageLockedAt24=True,individualRewards=True)


if __name__=='__main__':
    lua,core=runtime()
    result={'lava':{'lua':check_lava(lua,core)},'overseer':{'lua':check_overseer(lua,core)}}
    with lab() as url:
        result['lava']['http']=check_http(url,LAVA,'FLD02',105,'lavaHeat',137,gate=1195)
        result['overseer']['http']=check_http(url,OVERSEER,'FOV03',96,'purgePoints',140,gate=258)
    (ROOT/'evidence/coop-atocpan-lua-http.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result))
