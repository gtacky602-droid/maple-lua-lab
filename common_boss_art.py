"""Files used by the base boss renderer and its shared body parts."""
BASE = ('boss-sprites.json', 'anemo-shell-sprites.json', 'anemo-core-sprites.json', 'farka-sprites.json')
FARKA_ACTIONS = tuple(f'farka-action-{i}.json' for i in range(1,5))
GEO = {part:f'geo-{part}-sprites.json' for part in ('shell','core','pillar')}
ELECTRO = ('electro-shell-sprites.json','electro-core-sprites.json')
PYRO = 'pyro-regisvine-sprites.json'
CORE = {key:stem+'-sprites.json' for key,stem in (
    ('primoArt','primo'),('maguuArt','maguu'),('thunderArt','thunder'),('arrayArt','array'),
    ('maguuMaskArt','maguu-mask'),('maguuStanceArt','maguu-stance'),('maguuSlashArt','maguu-slash'))}
ARRAY_PARTS = tuple(f'array-part-{i}-sprites.json' for i in range(1,5))
FILES = (*BASE,*FARKA_ACTIONS,PYRO,*ELECTRO,*GEO.values(),*CORE.values(),*ARRAY_PARTS)
