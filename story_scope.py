"""Resolve suspended story stages from the authored region settings."""


def suspended_stage_returns(graph):
    regions = graph.get('suspendedRegions', {})
    return {node['id']: regions[node['region']] for node in graph['nodes'] if node['region'] in regions}
