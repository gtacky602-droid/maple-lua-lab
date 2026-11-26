"""Resolve ordinary enemy and local legend pose files from the field design."""
def enemy_pose_files(layouts):
    return {key: layout.get('file', f'{key}-idle-sprites.json') for key, layout in layouts.items()}


def legend_pose_files(specs):
    result = {}
    for spec in specs:
        if spec['controller'] not in ('branchLegend', 'waterLegend'):
            continue
        revision = spec.get('artRevision', 1)
        for body in (spec, spec.get('partner'), *spec.get('members', [])):
            if body and body.get('art'):
                name = body['art']
                result[name] = {pose: f'{name}-field-{pose}-sprites-v{revision}.json'
                                for pose in ('idle', 'brace', 'strike')}
    return result
