(function() {
'use strict'

var _container = null
var _lastIndex = -1
var _svgWrap = null
var _sliderSpan = null
var _slidingArea = null
var _prevBtn = null
var _nextBtn = null
var _sliderBar = null
var _sliderHandle = null

var _gridSize = 24
var _nodeSize = 6
var _curScale = 1.8
var _nodeX = Math.round(_gridSize * 1.5)
var _zoom = 1
var _lastZoom = 1
var _camX = -_gridSize
var _camY = -_gridSize
var _viewW = 0
var _viewH = 0
var _totalH = 0

var _mouseDown = null
var _drag = false
var _initialCentered = false
var _animId = null
var _animateNext = false
var _treeCurIdx = -1

// Footer tree — cloned vertical tree rotated 90° CCW
var _footerWrap = null
var _footerCamY = 0
var _footerCamX = 0
var _fDrag = false
var _fDragData = null
var _wheelAcc = 0
var _lastWheelTime = 0
var _lastPathStr = ''
var _footerLastPathStr = ''
var _footerLastIdx = -1
var _footerText = null
var _footerMouseDown = false
var _footerAnimId = null

var getActiveMoveLabels = function() {
  if (typeof state === 'undefined' || !state || !state.sgfTree) return []
  var path = (state.variationData && state.variationData.currentBranchPath) || []
  var tree = state.sgfTree
  
  var moveLabels = []
  var currentTree = tree
  var depth = 0
  var varSuffixes = []
  
  for (var i = 0; i <= path.length; i++) {
    var limit = currentTree.nodes.length
    for (var j = 0; j < limit; j++) {
      var prop = currentTree.nodes[j].properties
      if (prop.B || prop.W) {
        depth++
        var label = "" + depth
        if (varSuffixes.length > 0) {
          label += "." + varSuffixes.join('.')
        }
        moveLabels.push(label)
      }
    }
    
    if (i < path.length) {
      var chosenIndex = path[i]
      if (chosenIndex > 0) {
        varSuffixes.push(chosenIndex)
      }
      if (currentTree.children && currentTree.children[chosenIndex]) {
        currentTree = currentTree.children[chosenIndex]
      } else {
        break
      }
    }
  }
  
  var descTree = currentTree
  while (descTree.children && descTree.children.length > 0) {
    descTree = descTree.children[0]
    for (var j = 0; j < descTree.nodes.length; j++) {
      var prop = descTree.nodes[j].properties
      if (prop.B || prop.W) {
        depth++
        var label = "" + depth
        if (varSuffixes.length > 0) {
          label += "." + varSuffixes.join('.')
        }
        moveLabels.push(label)
      }
    }
  }
  
  return moveLabels
}

var getMoveLabelForIndex = function(idx) {
  if (idx < 0) return '0'
  var labels = getActiveMoveLabels()
  var start = (typeof state !== 'undefined' && state && state.filterStart) ? state.filterStart : 1
  var absIdx = idx + (start - 1)
  if (absIdx >= 0 && absIdx < labels.length) {
    return labels[absIdx]
  }
  return '' + (idx + 1)
}

var navigate = function(idx) {
  if (typeof goToMove === 'function' && typeof state !== 'undefined' && state) {
    var count = (state.sgfMoves || []).length
    if (!count) return
    goToMove(Math.max(-1, Math.min(count - 1, idx)))
  }
}

var animateY = function(targetY, duration) {
  if (_animId) { cancelAnimationFrame(_animId); _animId = null }
  var startY = _camY
  var startTime = null
  var step = function(timestamp) {
    if (!startTime) startTime = timestamp
    var progress = Math.min(1, (timestamp - startTime) / duration)
    var eased = 1 - Math.pow(1 - progress, 3)
    _camY = startY + (targetY - startY) * eased
    applyCamera()
    if (progress < 1) {
      _animId = requestAnimationFrame(step)
    } else {
      _animId = null
    }
  }
  _animId = requestAnimationFrame(step)
}

var animateFooterCam = function(targetY, duration) {
  if (_footerAnimId) { cancelAnimationFrame(_footerAnimId); _footerAnimId = null }
  var startY = _footerCamY
  var startX = _footerCamX
  var startTime = null
  var step = function(timestamp) {
    if (!startTime) startTime = timestamp
    var progress = Math.min(1, (timestamp - startTime) / duration)
    var eased = 1 - Math.pow(1 - progress, 3)
    _footerCamY = startY + (targetY - startY) * eased
    _footerCamX = startX + (0 - startX) * eased
    applyCamera()
    if (progress < 1) {
      _footerAnimId = requestAnimationFrame(step)
    } else {
      _footerAnimId = null
    }
  }
  _footerAnimId = requestAnimationFrame(step)
}

var centerOnNode = function(idx, animated) {
  if (!_viewW || !_viewH) return
  var nodeY = _nodeSize * _zoom + idx * _gridSize * _zoom
  var effNodeX = Math.round(_gridSize * _zoom * 1.5)
  _camX = Math.round(effNodeX - _viewW / 2)
  var targetY = Math.round(nodeY - _viewH / 2)
  _initialCentered = true
  if (animated) {
    animateY(targetY, 200)
  } else {
    _camY = targetY
    applyCamera()
  }
}

var applyCamera = function() {
  var sty = _svgWrap && _svgWrap.querySelector('style[data-cam]')
  if (sty) {
    sty.textContent = '#gt-graph svg > * { transform: translate(' + (-_camX) + 'px, ' + (-_camY) + 'px); transform-origin:0 0 }'
  }
  var fsty = _footerWrap && _footerWrap.querySelector('style[data-fcam]')
  if (fsty) {
    fsty.textContent = '.gt-footer-inner svg { transform: translate(' + (-_footerCamX) + 'px, ' + (-_footerCamY) + 'px); transform-origin:0 0 }'
  }
}

var renderFooterTree = function() {
  if (!_footerWrap || typeof state === 'undefined' || !state) return
  var moves = state.sgfMoves || []
  var idx = state.currentMoveIndex
  var count = moves.length
  var prevIdx = _footerLastIdx
  _footerLastIdx = idx

  if (!state.sgfTree) {
    _footerWrap.innerHTML = ''
    _footerWrap.style.display = 'none'
    var footer = document.querySelector('footer.app-footer')
    if (footer) {
      if (_footerText) _footerText.style.display = ''
      footer.classList.remove('tree-active')
    }
    return
  }

  // Re-enter tree mode
  var footer = document.querySelector('footer.app-footer')
  if (footer) {
    if (_footerText) _footerText.style.display = 'none'
    footer.classList.add('tree-active')
  }

  var layout = buildTreeLayout(state.sgfTree)

  var zGrid = _gridSize * _zoom
  var zNode = _nodeSize * _zoom
  var zCur = zNode * _curScale
  var padY = Math.round(zNode * _curScale) + zGrid - zNode

  var getNodeX = function(col) {
    return Math.round(zGrid * 1.5) + col * zGrid
  }

  var getNodeY = function(depth) {
    if (depth === 0) return padY + zNode - zGrid
    return padY + zNode + (depth - 1) * zGrid
  }

  var maxY = 0
  var maxCol = 0
  layout.nodes.forEach(function(rn) {
    if (rn.y > maxY) maxY = rn.y
    if (rn.x > maxCol) maxCol = rn.x
  })

  var totalH = padY + zNode + maxY * zGrid + zNode
  var svgW = Math.max(175, Math.round(zGrid * 1.5) + maxCol * zGrid + Math.round(zGrid * 1.5))
  var sliderW = 20
  var footH = svgW + sliderW

  var currentActiveProps = null
  if (state.currentMoveIndex >= 0 && state.allSgfMoves && state.allSgfMoves[state.currentMoveIndex]) {
    currentActiveProps = state.allSgfMoves[state.currentMoveIndex].sgfNode
  } else if (state.currentMoveIndex === -1 && state.sgfTree && state.sgfTree.nodes.length > 0) {
    currentActiveProps = state.sgfTree.nodes[0].properties
  }

  var activePropsSet = new Set()
  if (state.sgfTree && state.sgfTree.nodes.length > 0) {
    activePropsSet.add(state.sgfTree.nodes[0].properties)
  }
  if (state.allSgfMoves) {
    state.allSgfMoves.forEach(function(m) {
      if (m.sgfNode) {
        activePropsSet.add(m.sgfNode)
      }
    })
  }

  var parts = []
  parts.push('<svg width="' + svgW + '" height="' + totalH + '" style="display:block;margin-left:' + sliderW + 'px">')

  // Render connections
  layout.connections.forEach(function(conn) {
    var fromNode = conn.from
    var toNode = conn.to
    
    var x1 = getNodeX(fromNode.x)
    var y1 = getNodeY(fromNode.y)
    var x2 = getNodeX(toNode.x)
    var y2 = getNodeY(toNode.y)
    
    var isActive = activePropsSet.has(fromNode.properties) && activePropsSet.has(toNode.properties)
    var stroke = isActive ? '#059669' : '#333'
    var strokeWidth = isActive ? '1.5' : '1'
    
    parts.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"></line>')
  })

  // Render nodes
  parts.push('<g>')
  layout.nodes.forEach(function(rn) {
    var isCur = rn.properties === currentActiveProps
    var r = zNode * (isCur ? _curScale : 1)
    var cx = getNodeX(rn.x)
    var cy = getNodeY(rn.y)
    
    var p = nodeProps(getMovePropsForRender(rn))
    var cls = 'fnode' + (isCur ? ' current' : '')
    
    var d = (rn.y === 0) ? diamondPath(cx, cy, r) : nodePath(cx, cy, r)
    
    var pathAttr = 'data-path="' + JSON.stringify(rn.path).replace(/"/g, '&quot;') + '"'
    var nodeIdxAttr = 'data-node-idx="' + rn.nodeIndex + '"'
    
    var isActive = activePropsSet.has(rn.properties)
    var opacityStyle = isActive ? '' : ' opacity: 0.4;'
    
    parts.push('<path d="' + d + '" class="' + cls + '" fill="' + p.fill + '" ' + pathAttr + ' ' + nodeIdxAttr + ' data-cx="' + cx + '" data-cy="' + cy + '" style="cursor:pointer;' + opacityStyle + '"></path>')
  })
  parts.push('</g></svg>')

  // Camera style
  parts.push('<style data-fcam="">.gt-footer-inner svg { transform: translate(0px, 0px); transform-origin:0 0 }</style>')

  // Horizontal Slider HTML (centered, overlay)
  var pct = moves.length > 1 ? (idx < 0 ? 0 : (idx / (moves.length - 1)) * 100) : 0
  var sliderHtml = [
    '<div class="gt-footer-slider">',
    '  <button class="fprev">◀</button>',
    '  <div class="finner">',
    '    <div class="fbar" style="width:' + pct + '%"></div>',
    '    <div class="fhandle" style="left:' + pct + '%"><span>' + getMoveLabelForIndex(idx) + '</span></div>',
    '  </div>',
    '  <button class="fnext">▶</button>',
    '</div>'
  ].join('\n')

  _footerWrap.innerHTML = '<div class="gt-footer-inner">' + parts.join('') + '</div>' + sliderHtml

  // Ensure wrap visible
  _footerWrap.style.display = ''
  var inner = _footerWrap.querySelector('.gt-footer-inner')
  if (inner) {
    var mainLineX = getNodeX(0)
    inner.style.transform = 'translate(0, calc(' + mainLineX + 'px + ' + sliderW + 'px + var(--footer-center-y, 22.5px))) rotate(-90deg)'
    inner.style.width = footH + 'px'
  }

  // Center camera with smooth animation on navigation
  var activeRenderNode = layout.nodes.find(function(rn) {
    return rn.properties === currentActiveProps
  })
  var nodeY = activeRenderNode ? getNodeY(activeRenderNode.y) : getNodeY(0)
  var camWindow = _footerWrap.clientWidth || window.innerWidth || 1200
  var targetCamY = Math.round(nodeY - camWindow / 2)

  if (_footerAnimId) { cancelAnimationFrame(_footerAnimId); _footerAnimId = null }
  if (prevIdx === -1 || prevIdx === idx) {
    _footerCamY = targetCamY
    _footerCamX = 0
    applyCamera()
  } else {
    animateFooterCam(targetCamY, 200)
  }
}

var nodeProps = function(move) {
  var color = [238, 238, 238]
  if (!move) return { fill: 'rgb(238,238,238)' }

  var ma = move.moveAnnotation
  var na = move.nodeAnnotation
  var hasComment = !!(move.comment)
  var hasName = !!(move.nodeName)

  if (ma && ma.type === 'BM') color = [240, 35, 17]
  else if (ma && ma.type === 'DO') color = [146, 39, 143]
  else if (ma && ma.type === 'IT') color = [72, 134, 213]
  else if (ma && ma.type === 'TE') color = [89, 168, 15]
  else if (na || hasComment || hasName) color = [255, 174, 61]

  return { fill: 'rgb(' + color.join(',') + ')' }
}

var nodePath = function(cx, cy, r) {
  var d = r * 2
  return 'M ' + cx + ' ' + cy + ' m ' + (-r) + ' 0 a ' + r + ' ' + r + ' 0 1 0 ' + d + ' 0 a ' + r + ' ' + r + ' 0 1 0 ' + (-d) + ' 0'
}

var diamondPath = function(cx, cy, r) {
  return 'M ' + cx + ' ' + (cy - r) + ' L ' + (cx + r) + ' ' + cy + ' L ' + cx + ' ' + (cy + r) + ' L ' + (cx - r) + ' ' + cy + ' Z'
}

var buildTreeLayout = function(tree) {
  var renderNodes = []
  var renderConnections = []
  
  var layoutBranch = function(t, col, startY, path, parentRenderNode) {
    var currentParent = parentRenderNode
    var depth = startY
    var lastNodeOfSequence = null
    
    for (var i = 0; i < t.nodes.length; i++) {
      var sgfNode = t.nodes[i]
      var node = {
        path: path.slice(),
        nodeIndex: i,
        x: col,
        y: depth,
        properties: sgfNode.properties,
        parent: currentParent,
        children: []
      }
      
      renderNodes.push(node)
      
      if (currentParent) {
        currentParent.children.push(node)
        renderConnections.push({
          from: currentParent,
          to: node
        })
      }
      
      currentParent = node
      lastNodeOfSequence = node
      depth++
    }
    
    var maxCol = col
    if (t.children && t.children.length > 0) {
      for (var idx = 0; idx < t.children.length; idx++) {
        var childTree = t.children[idx]
        var childPath = path.slice()
        childPath.push(idx)
        
        var targetCol = (idx === 0) ? col : maxCol + 1
        var childMaxCol = layoutBranch(childTree, targetCol, depth, childPath, lastNodeOfSequence)
        maxCol = Math.max(maxCol, childMaxCol)
      }
    }
    
    return maxCol
  }
  
  if (tree) {
    layoutBranch(tree, 0, 0, [], null)
  }
  
  return { nodes: renderNodes, connections: renderConnections }
}

var getMovePropsForRender = function(rn) {
  var props = rn.properties
  
  var moveAnnotation = null
  if (props.TE) moveAnnotation = { type: 'TE', value: props.TE[0] }
  else if (props.BM) moveAnnotation = { type: 'BM', value: props.BM[0] }
  else if (props.DO) moveAnnotation = { type: 'DO', value: null }
  else if (props.IT) moveAnnotation = { type: 'IT', value: null }

  var nodeAnnotation = null
  if (props.GB) nodeAnnotation = { type: 'GB', value: props.GB[0] }
  else if (props.GW) nodeAnnotation = { type: 'GW', value: props.GW[0] }
  else if (props.DM) nodeAnnotation = { type: 'DM', value: props.DM[0] }
  else if (props.UC) nodeAnnotation = { type: 'UC', value: props.UC[0] }

  return {
    comment: props.C ? props.C[0] : null,
    nodeName: props.N ? props.N[0] : null,
    moveAnnotation: moveAnnotation,
    nodeAnnotation: nodeAnnotation
  }
}

var render = function() {
  if (!_svgWrap || typeof state === 'undefined' || !state) return
  var moves = state.sgfMoves || []
  var idx = state.currentMoveIndex
  var pathStr = state.variationData ? JSON.stringify(state.variationData.currentBranchPath) : ''
  if (idx === _lastIndex && _zoom === _lastZoom && pathStr === _lastPathStr) return
  _lastIndex = idx
  _lastZoom = _zoom
  _lastPathStr = pathStr
  _treeCurIdx = idx

  if (!state.sgfTree) {
    _svgWrap.innerHTML = ''
    _sliderSpan.textContent = '0'
    _sliderHandle.style.top = '0%'
    _sliderBar.style.height = '0%'
    _treeCurIdx = -1
    renderFooterTree()
    return
  }

  var layout = buildTreeLayout(state.sgfTree)
  _viewW = _svgWrap.clientWidth || 120
  _viewH = _svgWrap.clientHeight || 80

  var zGrid = _gridSize * _zoom
  var zNode = _nodeSize * _zoom
  var zCur = zNode * _curScale
  var padY = Math.round(zNode * _curScale) + zGrid - zNode

  var getNodeX = function(col) {
    return Math.round(zGrid * 1.5) + col * zGrid
  }

  var getNodeY = function(depth) {
    if (depth === 0) return padY + zNode - zGrid
    return padY + zNode + (depth - 1) * zGrid
  }

  var maxY = 0
  layout.nodes.forEach(function(rn) {
    if (rn.y > maxY) maxY = rn.y
  })
  _totalH = padY + zNode + maxY * zGrid + zNode

  var currentActiveProps = null
  if (state.currentMoveIndex >= 0 && state.allSgfMoves && state.allSgfMoves[state.currentMoveIndex]) {
    currentActiveProps = state.allSgfMoves[state.currentMoveIndex].sgfNode
  } else if (state.currentMoveIndex === -1 && state.sgfTree && state.sgfTree.nodes.length > 0) {
    currentActiveProps = state.sgfTree.nodes[0].properties
  }

  var activePropsSet = new Set()
  if (state.sgfTree && state.sgfTree.nodes.length > 0) {
    activePropsSet.add(state.sgfTree.nodes[0].properties)
  }
  if (state.allSgfMoves) {
    state.allSgfMoves.forEach(function(m) {
      if (m.sgfNode) {
        activePropsSet.add(m.sgfNode)
      }
    })
  }

  var parts = []
  parts.push('<svg width="' + _viewW + '" height="' + _viewH + '" style="display:block">')

  // Render connections
  layout.connections.forEach(function(conn) {
    var fromNode = conn.from
    var toNode = conn.to
    
    var x1 = getNodeX(fromNode.x)
    var y1 = getNodeY(fromNode.y)
    var x2 = getNodeX(toNode.x)
    var y2 = getNodeY(toNode.y)
    
    var isActive = activePropsSet.has(fromNode.properties) && activePropsSet.has(toNode.properties)
    var stroke = isActive ? '#059669' : '#333'
    var strokeWidth = isActive ? '1.5' : '1'
    
    parts.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"></line>')
  })

  // Render nodes
  parts.push('<g>')
  layout.nodes.forEach(function(rn) {
    var isCur = rn.properties === currentActiveProps
    var r = zNode * (isCur ? _curScale : 1)
    var cx = getNodeX(rn.x)
    var cy = getNodeY(rn.y)
    
    var p = nodeProps(getMovePropsForRender(rn))
    var cls = 'node' + (isCur ? ' current' : '')
    
    var d = (rn.y === 0) ? diamondPath(cx, cy, r) : nodePath(cx, cy, r)
    
    var pathAttr = 'data-path="' + JSON.stringify(rn.path).replace(/"/g, '&quot;') + '"'
    var nodeIdxAttr = 'data-node-idx="' + rn.nodeIndex + '"'
    
    var isActive = activePropsSet.has(rn.properties)
    var opacityStyle = isActive ? '' : ' opacity: 0.4;'
    
    parts.push('<path d="' + d + '" class="' + cls + '" fill="' + p.fill + '" ' + pathAttr + ' ' + nodeIdxAttr + ' data-cx="' + cx + '" data-cy="' + cy + '" style="cursor:pointer;' + opacityStyle + '"></path>')
  })
  parts.push('</g></svg>')

  _svgWrap.innerHTML = parts.join('')

  var sty = document.createElement('style')
  sty.setAttribute('data-cam', '')
  _svgWrap.appendChild(sty)

  var activeRenderNode = layout.nodes.find(function(rn) {
    return rn.properties === currentActiveProps
  })

  var centerOnActiveNode = function(animated) {
    if (!_viewW || !_viewH) return
    var cx = activeRenderNode ? getNodeX(activeRenderNode.x) : getNodeX(0)
    var cy = activeRenderNode ? getNodeY(activeRenderNode.y) : getNodeY(0)
    
    var targetX = Math.round(cx - _viewW / 2)
    var targetY = Math.round(cy - _viewH / 2)
    
    _initialCentered = true
    _camX = targetX
    if (animated) {
      animateY(targetY, 200)
    } else {
      _camY = targetY
      applyCamera()
    }
  }

  centerOnActiveNode(_animateNext)
  _animateNext = false

  if (!_initialCentered || _viewW <= 120) {
    setTimeout(function() {
      _viewW = _svgWrap.clientWidth
      _viewH = _svgWrap.clientHeight
      centerOnActiveNode(false)
    }, 50)
  }

  if (moves.length > 1) {
    var pct = idx < 0 ? 0 : (idx / (moves.length - 1)) * 100
    _sliderSpan.textContent = getMoveLabelForIndex(idx)
    _sliderHandle.style.top = pct + '%'
    _sliderBar.style.height = pct + '%'
  } else {
    _sliderSpan.textContent = getMoveLabelForIndex(idx)
    _sliderHandle.style.top = '50%'
    _sliderBar.style.height = '50%'
  }

  renderFooterTree()
}

var initFooterTree = function() {
  if (_footerWrap) return
  var footer = document.querySelector('footer.app-footer')
  if (!footer) return
  _footerWrap = document.createElement('div')
  _footerWrap.id = 'gt-footer-tree'
  footer.insertBefore(_footerWrap, footer.firstChild)

  // Switch footer to dark tree mode
  _footerText = footer.querySelector('p')
  if (_footerText) _footerText.style.display = 'none'
  footer.classList.add('tree-active')

  // Click on nodes
  _footerWrap.addEventListener('click', function(e) {
    if (_fDrag) { _fDrag = false; return }
    var el = e.target.closest('.fnode')
    if (!el) return
    
    var pathStr = el.getAttribute('data-path')
    var nodeIdxStr = el.getAttribute('data-node-idx')
    if (pathStr !== null && nodeIdxStr !== null) {
      try {
        var path = JSON.parse(pathStr)
        var nodeIdx = parseInt(nodeIdxStr, 10)
        if (typeof window.switchBranchAndGoToNode === 'function') {
          window.switchBranchAndGoToNode(path, nodeIdx)
        }
      } catch (err) {
        console.error('Error parsing footer node attributes', err)
      }
    }
  })

  // Prev/next buttons
  _footerWrap.addEventListener('click', function(e) {
    var t = e.target
    if (t.classList.contains('fprev')) { e.preventDefault(); navigate(state.currentMoveIndex - 1) }
    if (t.classList.contains('fnext')) { e.preventDefault(); navigate(state.currentMoveIndex + 1) }
  })

  // Slider dragging logic for the new centered horizontal slider
  var isSliderDragging = false

  var handleSliderDrag = function(clientX) {
    var track = _footerWrap.querySelector('.gt-footer-slider .finner')
    if (!track) return
    var count = (state.sgfMoves || []).length
    if (count < 2) return
    var rect = track.getBoundingClientRect()
    var pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    goToMove(Math.round(pct * (count - 1)))
  }

  _footerWrap.addEventListener('mousedown', function(e) {
    var track = e.target.closest('.gt-footer-slider .finner')
    if (track) {
      isSliderDragging = true
      handleSliderDrag(e.clientX)
    }
  })

  document.addEventListener('mousemove', function(e) {
    if (isSliderDragging) {
      handleSliderDrag(e.clientX)
    }
  })

  document.addEventListener('mouseup', function() {
    isSliderDragging = false
  })

  // Drag
  _footerWrap.addEventListener('mousedown', function(e) {
    if (e.button === 0) _footerMouseDown = true
    if (e.target.closest('.fprev, .fnext, .finner')) return
    e.preventDefault()
    _fDrag = false
    _fDragData = { startX: e.clientX, startY: e.clientY, baseCamX: _footerCamX, baseCamY: _footerCamY }
    _footerWrap.style.cursor = 'grabbing'
  })

  // Wheel navigation / zoom (on footer)
  _footerWrap.addEventListener('wheel', function(e) {
    e.preventDefault()
    if (_footerMouseDown) {
      var oldZoom = _zoom
      _zoom *= (1 - e.deltaY * 0.001)
      _zoom = Math.max(0.5, Math.min(2.0, _zoom))
      if (_zoom !== oldZoom) {
        renderFooterTree()
        if (_svgWrap) { _lastZoom = -1; render() }
      }
      return
    }
    if (typeof goToMove !== 'function' || typeof state === 'undefined' || !state) return
    var count = (state.sgfMoves || []).length
    if (!count) return
    
    var now = performance.now()
    if (now - _lastWheelTime < 120) {
      return
    }
    
    if ((e.deltaY > 0 && _wheelAcc < 0) || (e.deltaY < 0 && _wheelAcc > 0)) {
      _wheelAcc = 0
    }
    _wheelAcc += e.deltaY
    var threshold = 40
    var cur = state.currentMoveIndex
    if (Math.abs(_wheelAcc) >= threshold) {
      var steps = _wheelAcc > 0 ? 1 : -1
      _wheelAcc = 0
      _lastWheelTime = now
      goToMove(Math.max(-1, Math.min(count - 1, cur + steps)))
    }
  }, { passive: false })
}

// Clean up footer drag and zoom on mouseup
document.addEventListener('mouseup', function() {
  _fDragData = null
  _footerMouseDown = false
  if (_footerWrap) _footerWrap.style.cursor = ''
})

// Always-active footer tree drag-pan (works without Study Mode)
document.addEventListener('mousemove', function(e) {
  if (_fDragData) {
    var dx = e.clientX - _fDragData.startX
    var dy = e.clientY - _fDragData.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _fDrag = true
    if (_fDrag) {
      _footerCamY = _fDragData.baseCamY - dx
      _footerCamX = _fDragData.baseCamX + dy
      applyCamera()
    }
  }
})

var buildDOM = function() {
  _container.innerHTML = ''
  _container.className = 'graphproperties'

  _svgWrap = document.createElement('section')
  _svgWrap.id = 'gt-graph'
  _container.appendChild(_svgWrap)

  var slider = document.createElement('section')
  slider.id = 'gt-slider'

  _prevBtn = document.createElement('a')
  _prevBtn.href = '#'
  _prevBtn.className = 'prev'
  _prevBtn.textContent = '\u25B2'

  _slidingArea = document.createElement('div')
  _slidingArea.className = 'inner'

  _sliderBar = document.createElement('div')
  _sliderBar.className = 'bar'
  _slidingArea.appendChild(_sliderBar)

  _sliderHandle = document.createElement('div')
  _sliderHandle.className = 'handle'
  _sliderSpan = document.createElement('span')
  _sliderSpan.textContent = '0'
  _sliderHandle.appendChild(_sliderSpan)
  _slidingArea.appendChild(_sliderHandle)

  _nextBtn = document.createElement('a')
  _nextBtn.href = '#'
  _nextBtn.className = 'next'
  _nextBtn.textContent = '\u25BC'

  slider.appendChild(_prevBtn)
  slider.appendChild(_slidingArea)
  slider.appendChild(_nextBtn)
  _container.appendChild(slider)

  _prevBtn.addEventListener('mousedown', function(e) {
    e.preventDefault()
    navigate(state.currentMoveIndex - 1)
  })
  _nextBtn.addEventListener('mousedown', function(e) {
    e.preventDefault()
    navigate(state.currentMoveIndex + 1)
  })

  // Slider dragging logic for the new vertical slider
  var isVerticalSliderDragging = false

  var handleVerticalSliderDrag = function(clientY) {
    var count = (state.sgfMoves || []).length
    if (count < 2) return
    var rect = _slidingArea.getBoundingClientRect()
    var pct = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    goToMove(Math.round(pct * (count - 1)))
  }

  _slidingArea.addEventListener('mousedown', function(e) {
    isVerticalSliderDragging = true
    handleVerticalSliderDrag(e.clientY)
  })

  document.addEventListener('mousemove', function(e) {
    if (isVerticalSliderDragging) {
      handleVerticalSliderDrag(e.clientY)
    }
  })

  document.addEventListener('mouseup', function() {
    isVerticalSliderDragging = false
  })

  _svgWrap.addEventListener('wheel', function(e) {
    e.preventDefault()
    // Left-click hold + scroll = zoom
    if (_mouseDown === 0) {
      var oldZoom = _zoom
      _zoom *= (1 - e.deltaY * 0.001)
      _zoom = Math.max(0.3, Math.min(3.0, _zoom))
      if (_zoom !== oldZoom) render()
      return
    }
    // Plain scroll = navigate
    if (typeof goToMove !== 'function' || typeof state === 'undefined' || !state) return
    var count = (state.sgfMoves || []).length
    if (!count) return
    
    var now = performance.now()
    if (now - _lastWheelTime < 120) {
      return
    }
    
    if ((e.deltaY > 0 && _wheelAcc < 0) || (e.deltaY < 0 && _wheelAcc > 0)) {
      _wheelAcc = 0
    }
    _wheelAcc += e.deltaY
    var threshold = 40
    if (Math.abs(_wheelAcc) >= threshold) {
      var steps = _wheelAcc > 0 ? 1 : -1
      _wheelAcc = 0
      _lastWheelTime = now
      goToMove(Math.max(-1, Math.min(count - 1, _treeCurIdx + steps)))
    }
  }, { passive: false })

  _svgWrap.addEventListener('mousedown', function(e) {
    _mouseDown = e.button
    _drag = false
    _svgWrap.style.cursor = 'grabbing'
  })

  _svgWrap.addEventListener('click', function(e) {
    if (_drag) {
      _drag = false;
      e.stopPropagation();
      return;
    }
    var el = e.target.closest('.node')
    if (!el) return
    
    var pathStr = el.getAttribute('data-path')
    var nodeIdxStr = el.getAttribute('data-node-idx')
    if (pathStr !== null && nodeIdxStr !== null) {
      try {
        var path = JSON.parse(pathStr)
        var nodeIdx = parseInt(nodeIdxStr, 10)
        if (typeof window.switchBranchAndGoToNode === 'function') {
          window.switchBranchAndGoToNode(path, nodeIdx)
        }
      } catch (err) {
        console.error('Error parsing tree node data attributes', err)
      }
    }
  }, { capture: true })

  document.addEventListener('mousemove', function(e) {
    var zGrid = _gridSize * _zoom

    if (_mouseDown === 0) {
      if (e.movementX !== 0 || e.movementY !== 0) _drag = true
      _camX = Math.max(-_viewW * 2, Math.min(_viewW * 2, _camX - e.movementX))
      _camY = _camY - e.movementY
      if (_animId) { cancelAnimationFrame(_animId); _animId = null }
      applyCamera()
    }
    if (!_svgWrap) return
    var rect = _svgWrap.getBoundingClientRect()
    var mx = e.clientX - rect.left + _camX
    var my = e.clientY - rect.top + _camY
    
    _svgWrap.querySelectorAll('.node').forEach(function(el) {
      var cx = parseFloat(el.getAttribute('data-cx'))
      var cy = parseFloat(el.getAttribute('data-cy'))
      if (isNaN(cx) || isNaN(cy)) return
      
      el.classList.toggle('hover', Math.hypot(mx - cx, my - cy) < zGrid / 2)
    })
  })

  document.addEventListener('mouseup', function() {
    _mouseDown = -1
    _drag = false
    if (_svgWrap) _svgWrap.style.cursor = ''
  })
}

var _hookGoToMove = function() {
  if (typeof goToMove !== 'function') return
  var orig = goToMove
  goToMove = function(idx) {
    orig(idx)
    _animateNext = true
    setTimeout(render, 0)
  }
}

var _pollId = setInterval(function() {
  if (!_container || !_container.parentNode) return
  if (typeof state === 'undefined' || !state) return
  var pathStr = state.variationData ? JSON.stringify(state.variationData.currentBranchPath) : ''
  if (state.currentMoveIndex !== _lastIndex || pathStr !== _lastPathStr) {
    _lastPathStr = pathStr
    _animateNext = true
    render()
  }
}, 100)

// Force tree re-render (e.g. after annotation/comment edits)
window.refreshGameTree = function() {
  _lastIndex = -1
  _lastPathStr = ''
  _footerLastIdx = -1
  _footerLastPathStr = ''
  render()
  renderFooterTree()
}

var onResize = function() {
  _lastIndex = -1
  _lastZoom = -1
  render()
}

// Auto-init footer tree when SGF data loads (no Study Mode dependency)
var _footerLastCount = -1
var _footerPollId = setInterval(function() {
  if (typeof state === 'undefined' || !state) return
  var count = (state.sgfMoves || []).length
  var pathStr = state.variationData ? JSON.stringify(state.variationData.currentBranchPath) : ''
  if (!_footerWrap) {
    if (count > 0 && document.querySelector('footer.app-footer')) {
      initFooterTree()
      _footerLastCount = count
      _footerLastIdx = state.currentMoveIndex
      _footerLastPathStr = pathStr
      renderFooterTree()
    }
    return
  }
  if (state.currentMoveIndex !== _footerLastIdx || count !== _footerLastCount || pathStr !== _footerLastPathStr) {
    _footerLastCount = count
    _footerLastIdx = state.currentMoveIndex
    _footerLastPathStr = pathStr
    renderFooterTree()
  }
}, 100)

window.GameTree = {
  init: function(container) {
    _container = container
    buildDOM()
    initFooterTree()
    _hookGoToMove()
    window.addEventListener('resize', onResize)
    setTimeout(render, 100)
  },
  renderFooterTree: function() {
    renderFooterTree()
  }
}

})()
