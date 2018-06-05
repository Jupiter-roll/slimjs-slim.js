;(function() {

  try {
    const {Slim} = window
    if (!!Slim && Symbol.slimjs && Slim.plugins && Slim.asap) {
      const warn = console.error || console.warn || console.log
      return warn(
        'Stopping script: slim.js already initialized'
      )
    }
  } catch (err) {}

  const _$ = Symbol.slimjs = Symbol('@SlimInternals')

  const __flags = {
    isWCSupported:
    'customElements' in window &&
    'import' in document.createElement('link') &&
    'content' in document.createElement('template'),
    isIE11: !!window['MSInputMethodContext'] && !!document['documentMode'],
    isChrome: undefined,
    isEdge: undefined,
    isSafari: undefined,
    isFirefox: undefined,
  }

  try {
    __flags.isChrome = /Chrome/.test(navigator.userAgent)
    __flags.isEdge = /Edge/.test(navigator.userAgent)
    __flags.isSafari = /Safari/.test(navigator.userAgent)
    __flags.isFirefox = /Firefox/.test(navigator.userAgent)

    if (__flags.isIE11 || __flags.isEdge) {
      __flags.isChrome = false
      Object.defineProperty(Node.prototype, 'children', function() {
        return this.childNodes
      })
    }
  } catch (err) {}

  class Internals {
    constructor() {
      this.boundParent = null
      this.repeater = {}
      this.bindings = {}
      this.inbounds = {}
      this.eventHandlers = {}
      this.rootElement = null
      this.createdCallbackInvoked = false
      this.sourceText = null
      this.excluded = false
      this.autoBoundAttributes = []
    }
  }

  class Slim extends HTMLElement {
    static dashToCamel(dash) {
      return dash.indexOf('-') < 0
        ? dash
        : dash.replace(/-[a-z]/g, m => {
          return m[1].toUpperCase()
        })
    }
    static camelToDash(camel) {
      return camel.replace(/([A-Z])/g, '-$1').toLowerCase()
    }

    static get rxProp() {
      return /(.+[^(\((.+)\))])/ // eslint-disable-line
    }
    static get rxMethod() {
      return /(.+)(\((.+)\)){1}/ // eslint-disable-line
    }

    static lookup(target, expression, maybeRepeated) {
      const chain = expression.split('.')
      let o
      if (maybeRepeated && maybeRepeated[_$].repeater[chain[0]]) {
        o = maybeRepeated[_$].repeater
      } else {
        o = target
      }
      let i = 0
      while (o && i < chain.length) {
        o = o[chain[i++]]
      }
      return o
    }

    // noinspection JSUnresolvedVariable
    static _$(target) {
      target[_$] = target[_$] || new Internals()
      return target[_$]
    }
    static polyFill(url) {
      if (!__flags.isWCSupported) {
        const existingScript = document.querySelector(
          'script[data-is-slim-polyfill="true"]'
        )
        if (!existingScript) {
          const script = document.createElement('script')
          script.setAttribute('data-is-slim-polyfill', 'true')
          script.src = url
          document.head.appendChild(script)
        }
      }
    }
    static tag(tagName, tplOrClazz, clazz) {
      if (clazz === undefined) {
        clazz = tplOrClazz
      } else {
        Slim.tagToTemplateDict.set(tagName, tplOrClazz)
      }
      this.classToTagDict.set(clazz, tagName)
      customElements.define(tagName, clazz)
    }

    static tagOf(clazz) {
      return this.classToTagDict.get(clazz)
    }

    /**
     * @deprecated
     * @param tag
     * @returns {Function} Class constructor
     */
    static classOf(tag) {
      return customElements.get(tag)
    }

    static plugin(phase, plugin) {
      if (!this.plugins[phase]) {
        throw new Error(
          `Cannot attach plugin: ${phase} is not a supported phase`
        )
      }
      this.plugins[phase].push(plugin)
    }

    static checkCreationBlocking(element) {
      if (element.attributes) {
        for (let i = 0, n = element.attributes.length; i < n; i++) {
          const attribute = element.attributes[i]
          for (let [test, directive] of Slim[_$].customDirectives) {
            const value = directive.isBlocking && test(attribute)
            if (value) {
              return true
            }
          }
        }
      }
      return false
    }

    static customDirective(testFn, fn, isBlocking) {
      if (this[_$].customDirectives.has(testFn)) {
        throw new Error(
          `Cannot register custom directive: ${testFn} already registered`
        )
      }
      fn.isBlocking = isBlocking
      this[_$].customDirectives.set(testFn, fn)
    }

    static executePlugins(phase, target) {
      this.plugins[phase].forEach(fn => {
        fn(target)
      })
    }

    static qSelectAll(target, selector) {
      return [...target.querySelectorAll(selector)]
    }

    static unbind(source, target) {
      const bindings = source[_$].bindings
      Object.keys(bindings).forEach(key => {
        const chain = bindings[key].chain
        if (chain.has(target)) {
          chain.delete(target);
        }
      })
    }

    static root(target) {
      return target.__isSlim && target.useShadow
        ? target[_$].rootElement || target
        : target
    }

    static selectRecursive(target, force) {
      const collection = []
      const search = function(node, force) {
        collection.push(node)
        const allow =
          !node.__isSlim ||
          (node.__isSlim && !node.template) ||
          (node.__isSlim && node === target) ||
          force
        if (allow) {
          const children = [...Slim.root(node).children]
          children.forEach(childNode => {
            search(childNode, force)
          })
        }
      }
      search(target, force)
      return collection
    }

    static removeChild(target) {
      if (typeof target.remove === 'function') {
        target.remove()
      }
      if (target.parentNode) {
        target.parentNode.removeChild(target)
      }
      if (this._$(target).internetExploderClone) {
        this.removeChild(this._$(target).internetExploderClone)
      }
    }

    static moveChildren(source, target) {
      while (source.firstChild) {
        target.appendChild(source.firstChild)
      }
    }

    static wrapGetterSetter(element, expression) {
      const pName = expression.split('.')[0]
      let oSetter = element.__lookupSetter__(pName)
      if (oSetter && oSetter[_$]) return pName
      const srcValue = element[pName]
      const { bindings } = this._$(element);
      bindings[pName] = {
        chain: new Set(),
        value: srcValue,
      }
      bindings[pName].value = srcValue
      const newSetter = v => {
        oSetter && oSetter.call(element, v)
        bindings[pName].value = v
        element._executeBindings(pName);
      }
      newSetter[_$] = true
      element.__defineGetter__(pName, () => element[_$].bindings[pName].value)
      element.__defineSetter__(pName, newSetter)
      return pName
    }

    static bindOwn(target, expression, executor) {
      return Slim.bind(target, target, expression, executor)
    }

    static bind(source, target, expression, executor) {
      Slim._$(source)
      Slim._$(target)
      if (target[_$].excluded) return
      executor.source = source
      executor.target = target
      const pName = this.wrapGetterSetter(source, expression)
      if (!target[_$].repeater[pName]) {
        source[_$].bindings[pName].chain.add(target)
      }
      target[_$].inbounds[pName] = target[_$].inbounds[pName] || new Set()
      target[_$].inbounds[pName].add(executor)
      return executor
    }

    static update(target, ...props) {
      if (props.length === 0) {
        return Slim.commit(target)
      }
      for (const prop of props) {
        Slim.commit(target, prop);
      }
    }

    static commit(target, propertyName) {
      let $ = Slim._$(target)
      const props = propertyName ? [propertyName] : Object.keys($.bindings);
      for (const prop of props) {
        const inbounds = $.inbounds[prop]
        if (inbounds) {
          for (const fn of inbounds) {
            fn();
          }
        }
        const bindings = $.bindings[prop]
        if (bindings) {
          const nodes = bindings.chain
          for (const node of nodes) {
            Slim.commit(node, prop)
          }
        }
      }
    }

    /*
      Class instance
      */

    constructor() {
      super()
      Slim._$(this)
      this.__isSlim = true
      const init = () => {
        Slim.debug('ctor', this.localName)
        if (Slim.checkCreationBlocking(this)) {
          return
        }
        this.createdCallback()
      }
      if (__flags.isSafari) {
        Slim.asap(init)
      } else init()
    }

    // Native DOM Api V1

    createdCallback() {
      if (this[_$] && this[_$].createdCallbackInvoked) return
      this._initialize()
      this[_$].createdCallbackInvoked = true
      this.onBeforeCreated()
      Slim.executePlugins('create', this)
      this.render()
      this.onCreated()
    }

    // Native DOM Api V2

    connectedCallback() {
      this.onAdded()
      Slim.executePlugins('added', this)
    }

    disconnectedCallback() {
      this.onRemoved()
      Slim.executePlugins('removed', this)
    }

    attributeChangedCallback(attr, oldValue, newValue) {
      if (newValue !== oldValue && this.autoBoundAttributes.includes[attr]) {
        const prop = Slim.dashToCamel(attr)
        this[prop] = newValue
      }
    }
    // Slim internal API

    _executeBindings(prop) {
      Slim.debug('_executeBindings', this.localName, this)
      Slim.commit(this, prop)
    }

    _bindChildren(children) {
      Slim.debug('_bindChildren', this.localName)
      if (!children) {
        children = Slim.qSelectAll(this, '*')
      }
      for (let child of children) {
        Slim._$(child)
        if (child[_$].boundParent === this) continue
        child[_$].boundParent = child[_$].boundParent || this

        // todo: child.localName === 'style' && this.useShadow -> processStyleNodeInShadowMode

        if (child.attributes.length) {
          const attributes = Array.from(child.attributes)
          let i = 0
          let n = child.attributes.length
          while (i < n) {
            const source = this
            const attribute = attributes[i]
            if (!child[_$].excluded) {
              for (let [check, directive] of Slim[_$].customDirectives) {
                const match = check(attribute)
                if (match) {
                  directive(source, child, attribute, match)
                }
              }
            }
            i++
          }
        }
      }
    }

    _resetBindings() {
      Slim.debug('_resetBindings', this.localName)
      this[_$].bindings = {}
    }

    _render(customTemplate) {
      Slim.debug('_render', this.localName)
      Slim.executePlugins('beforeRender', this)
      this._resetBindings()
      ;[...this.children].forEach(childNode => {
        if (childNode.localName === 'style') {
          this[_$].externalStyle = document.importNode(childNode).cloneNode();
        }
      })
      Slim.root(this).innerHTML = '';
      const templateString = customTemplate || this.template
      const template = document.createElement('template');
      template.innerHTML = templateString;
      const frag = template.content.cloneNode(true);
      const { externalStyle }  = this[_$];
      if (externalStyle) {
        frag.appendChild(this[_$])
      }
      const scopedChildren = Slim.qSelectAll(frag, '*')
      const doRender = () => {
        (this[_$].rootElement || this).appendChild(frag)
        this._bindChildren(scopedChildren)
        this._executeBindings()
        this.onRender();
        Slim.executePlugins('afterRender', this)
      }
      if (this.useShadow) {
        doRender();
      } else {
        Slim.asap(doRender);
      }
    }

    _initialize() {
      Slim.debug('_initialize', this.localName)
      if (this.useShadow) {
        if (typeof HTMLElement.prototype.attachShadow === 'undefined') {
          this[_$].rootElement = this.createShadowRoot()
        } else {
          this[_$].rootElement = this.attachShadow({mode: 'open'})
        }
      } else {
        this[_$].rootElement = this
      }
      const observedAttributes = this.constructor.observedAttributes
      if (observedAttributes) {
        observedAttributes.forEach(attr => {
          const pName = Slim.dashToCamel(attr)
          this[pName] = this.getAttribute(attr)
        })
      }
    }

    // Slim public / protected API

    get autoBoundAttributes() {
      return []
    }

    commit(...args) {
      Slim.commit(this, ...args)
    }

    update(...args) {
      Slim.update(this, ...args)
    }

    render(tpl) {
      this._render(tpl)
    }

    onRender() {}
    onBeforeCreated() {}
    onCreated() {}
    onAdded() {}
    onRemoved() {}

    find(selector) {
      return this[_$].rootElement.querySelector(selector)
    }

    findAll(selector) {
      return Slim.qSelectAll(this[_$].rootElement, selector)
    }

    callAttribute(attr, data) {
      const fnName = this.getAttribute(attr)
      if (fnName) {
        return this[_$].boundParent[fnName](data)
      }
    }

    get useShadow() {
      return false
    }

    get template() {
      return Slim.tagToTemplateDict.get(Slim.tagOf(this.constructor))
    }
  }
  Slim.classToTagDict = new Map()
  // noinspection JSAnnotator
  Slim.tagToTemplateDict = new Map()
  // noinspection JSAnnotator
  Slim.plugins = {
    create: [],
    added: [],
    beforeRender: [],
    afterRender: [],
    removed: [],
  }

  Slim.debug = () => {}
  Slim.asap =
    window && window.requestAnimationFrame
      ? cb => window.requestAnimationFrame(cb)
      : typeof setImmediate !== 'undefined'
      ? setImmediate
      : cb => setTimeout(cb, 0)

  Slim[_$] = {
    customDirectives: new Map(),
    uniqueCounter: 0,
    supportedNativeEvents: [
      'click',
      'mouseover',
      'mouseout',
      'mousemove',
      'mouseenter',
      'mousedown',
      'mouseup',
      'dblclick',
      'contextmenu',
      'wheel',
      'mouseleave',
      'select',
      'pointerlockchange',
      'pointerlockerror',
      'focus',
      'blur',
      'input',
      'error',
      'invalid',
      'animationstart',
      'animationend',
      'animationiteration',
      'reset',
      'submit',
      'resize',
      'scroll',
      'keydown',
      'keypress',
      'keyup',
      'change',
    ],
  }

  Slim.customDirective(
    attr => attr.nodeName === 's:switch',
    (source, target, attribute) => {
      const expression = attribute.value
      let oldValue
      const anchor = document.createComment(`switch:${expression}`)
      target.appendChild(anchor)
      const children = [...target.children]
      const defaultChildren = children.filter(child =>
        child.hasAttribute('s:default')
      )
      const fn = () => {
        let value = Slim.lookup(source, expression, target)
        if (String(value) === oldValue) return
        let useDefault = true
        children.forEach(child => {
          if (child.getAttribute('s:case') === String(value)) {
            if (child.__isSlim) {
              child.createdCallback()
            }
            anchor.parentNode.insertBefore(child, anchor)
            useDefault = false
          } else {
            Slim.removeChild(child)
          }
        })
        if (useDefault) {
          defaultChildren.forEach(child => {
            if (child.__isSlim) {
              child.createdCallback()
            }
            anchor.parentNode.insertBefore(child, anchor)
          })
        } else {
          defaultChildren.forEach(child => {
            Slim.removeChild(child)
          })
        }
        oldValue = String(value)
      }
      Slim.bind(source, target, expression, fn)
    }
  )

  Slim.customDirective(attr => /^s:case$/.exec(attr.nodeName), () => {}, true)
  Slim.customDirective(
    attr => /^s:default$/.exec(attr.nodeName),
    () => {},
    true
  )

  // supported events (i.e. click, mouseover, change...)
  Slim.customDirective(
    attr => Slim[_$].supportedNativeEvents.indexOf(attr.nodeName) >= 0,
    (source, target, attribute) => {
      const eventName = attribute.nodeName
      const delegate = attribute.value
      Slim._$(target).eventHandlers = target[_$].eventHandlers || {}
      const allHandlers = target[_$].eventHandlers
      allHandlers[eventName] = allHandlers[eventName] || new WeakSet();
      let handler = e => {
        try {
          source[delegate].call(source, e) // eslint-disable-line
        } catch (err) {
          err.message = `Could not respond to event "${eventName}" on ${
            target.localName
            } -> "${delegate}" on ${source.localName} ... ${err.message}`
          console.warn(err)
        }
      }
      allHandlers[eventName].add(handler)
      target.addEventListener(eventName, handler)
      handler = null
    }
  )

  Slim.customDirective(
    attr => attr.nodeName === 's:if',
    (source, target, attribute) => {
      let expression = attribute.value
      let path = expression
      let isNegative = false
      if (path.charAt(0) === '!') {
        path = path.slice(1)
        isNegative = true
      }
      let oldValue
      const anchor = document.createComment(`{$target.localName} if:${expression}`)
      target.parentNode.insertBefore(anchor, target)
      const fn = () => {
        let value = !!Slim.lookup(source, path, target)
        if (isNegative) {
          value = !value
        }
        if (value === oldValue) return
        if (value) {
          if (target.__isSlim) {
            target.createdCallback()
          }
          anchor.parentNode.insertBefore(target, anchor.nextSibling)
        } else {
          Slim.removeChild(target)
        }
        oldValue = value
      }
      Slim.bind(source, target, path, fn)
    },
    true
  )

  // bind (text nodes)
  Slim.customDirective(
    attr => attr.nodeName === 'bind',
    (source, target) => {
      Slim._$(target)
      target[_$].sourceText = target.innerText.split('\n').join(' ')
      let updatedText = ''
      const matches = target.innerText.match(/\{\{([^\}\}]+)+\}\}/g) // eslint-disable-line
      const aggProps = {}
      const textBinds = {}
      if (matches) {
        matches.forEach(expression => {
          let oldValue
          const rxM = /\{\{(.+)(\((.+)\)){1}\}\}/.exec(expression)
          if (rxM) {
            const fnName = rxM[1]
            const pNames = rxM[3]
              .split(' ')
              .join('')
              .split(',')
            pNames
              .map(path => path.split('.')[0])
              .forEach(p => (aggProps[p] = true))
            textBinds[expression] = target => {
              const args = pNames.map(path => Slim.lookup(source, path, target))
              const fn = source[fnName]
              const value = fn ? fn.apply(source, args) : undefined
              if (oldValue === value) return
              updatedText = updatedText.split(expression).join(value || '')
            }
            return
          }
          const rxP = /\{\{(.+[^(\((.+)\))])\}\}/.exec(expression) // eslint-disable-line
          if (rxP) {
            const path = rxP[1]
            aggProps[path] = true
            textBinds[expression] = target => {
              const value = Slim.lookup(source, path, target)
              if (oldValue === value) return
              updatedText = updatedText.split(expression).join(value || '')
            }
          }
        })
        const chainExecutor = () => {
          updatedText = target[_$].sourceText
          Object.keys(textBinds).forEach(expression => {
            textBinds[expression](target)
          })
          target.innerText = updatedText
        }
        Object.keys(aggProps).forEach(prop => {
          Slim.bind(source, target, prop, chainExecutor)
        })
      }
    }
  )

  Slim.customDirective(
    attr => attr.nodeName === 's:id',
    (source, target, attribute) => {
      Slim._$(target).boundParent[attribute.value] = target
    }
  )

  // bind:property
  Slim.customDirective(
    attr => /^(bind):(\S+)/.exec(attr.nodeName),
    (source, target, attribute, match) => {
      const tAttr = match[2]
      const tProp = Slim.dashToCamel(tAttr)
      const expression = attribute.value
      let oldValue
      const rxM = Slim.rxMethod.exec(expression)
      if (rxM) {
        const pNames = rxM[3]
          .split(' ')
          .join('')
          .split(',')
        pNames.forEach(pName => {
          Slim.bind(source, target, pName, () => {
            const fn = Slim.lookup(source, rxM[1], target)
            const args = pNames.map(prop => Slim.lookup(source, prop, target))
            const value = fn.apply(source, args)
            if (oldValue === value) return
            target[tProp] = value
            target.setAttribute(tAttr, value)
          })
        })
        return
      }
      const rxP = Slim.rxProp.exec(expression)
      if (rxP) {
        const prop = rxP[1]
        Slim.bind(source, target, prop, () => {
          const value = Slim.lookup(source, expression, target)
          if (oldValue === value) return
          target.setAttribute(tAttr, value)
          target[tProp] = value
        })
      }
    }
  )

  Slim.customDirective(
    attr => attr.nodeName === 's:repeat',
    (source, repeaterNode, attribute) => {
      let path = attribute.value
      let tProp = 'data' // default
      if (path.indexOf(' as ') > 0) {
        [path, tProp] = path.split(' as ')
      }

      // initialize clones list
      let clones = [];

      // create mount point and repeat template
      const mountPoint = document.createComment(`${repeaterNode.localName} s:repeat="${attribute.value}"`)
      const parent = repeaterNode.parentElement || Slim.root(source)
      parent.insertBefore(mountPoint, repeaterNode);
      repeaterNode.removeAttribute('s:repeat')
      const clonesTemplate = repeaterNode.outerHTML
      repeaterNode.remove()

      // prepare for bind
      let oldDataSource = []

      const replicate = (n, text) => {
        let temp = text
        let result = ''
        if (n < 1) return result;
        while (n > 1) {
          if (n & 1) result += temp;
          n >>= 1;
          temp += temp;
        }
        return result + temp;
      };

      // bind changes
      Slim.bind(source, mountPoint, path, () => {
        // execute bindings here
        const dataSource = Slim.lookup(source, path) || [];
        // read the diff -> list of CHANGED indicies

        let fragment

        let tree = []

        // when data source shrinks, dispose extra clones
        if (dataSource.length < clones.length) {
          const disposables = clones.slice(dataSource.length)
          disposables.forEach(node => {
            Slim.unbind(source, node)
            if (node[_$].subTree) {
              node[_$].subTree.forEach(subNode => Slim.unbind(source, subNode))
            }
            node.remove()
          })
          clones.length = dataSource.length
        }

        // build new clones if needed
        if (dataSource.length > clones.length) {
          const offset = clones.length;
          const diff = dataSource.length - clones.length
          const html = replicate(diff, clonesTemplate) //  Array(diff).fill(clonesTemplate.innerHTML).join('');
          const range = document.createRange();
          range.setStartBefore(mountPoint);
          fragment = range.createContextualFragment(html)
          // build clone by index
          for (let i = 0; i < diff; i++) {
            const dataIndex = i + offset;
            const dataItem = dataSource[dataIndex];
            const clone = fragment.children[i]
            Slim._$(clone).repeater[tProp] = dataItem;
            const subTree = Slim.qSelectAll(clone, '*')
            subTree.forEach(function (node) {
              Slim._$(node).repeater[tProp] = dataItem
            })
            clone[_$].subTree = subTree
            clones.push(clone)
          }
          const fragmentTree = Slim.qSelectAll(fragment, '*')
          source._bindChildren(fragmentTree);
        }

        const init = (target, value) => {
          target[tProp] = value
          Slim.commit(target, tProp)
        }

        dataSource.forEach(function(dataItem, i) {
          if (oldDataSource[i] !== dataItem) {
            const rootNode = clones[i]
            ;[rootNode, ...(rootNode[_$].subTree || Slim.qSelectAll(rootNode, '*'))].forEach(node => {
              node[_$].repeater[tProp] = dataItem
              if (node.__isSlim) {
                node.createdCallback()
                Slim.asap(() => init(node, dataItem))
              } else {
                init(node, dataItem)
              }
            })
          }
        })
        oldDataSource = dataSource.concat()
        if (fragment) {
          Slim.asap( () => {
            parent.insertBefore(fragment, mountPoint)
          })
        }
      })
    },
    true
  )

  if (window) {
    window['Slim'] = Slim
  }
  if (typeof module !== 'undefined') {
    module.exports.Slim = Slim
  }
})()
