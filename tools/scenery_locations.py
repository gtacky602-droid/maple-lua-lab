def measurement_key(scene, node=None):
    """Keep a map's default painting and optional named states independently selectable."""
    location = node or scene['node']
    return f"{location}#{scene['phase']}" if scene.get('phase') else location
