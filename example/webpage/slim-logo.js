Slim.tag('slim-logo', class extends Slim {


    get template() { return `<img slim-id="img" src="slim3.png" width="460" height="183" style="[[effect(cx,cy)]]" />`}

    onCreated() {
        document.body.addEventListener('mousemove', e => {
            this.cx = e.clientX
            this.cy = e.clientY
        })
    }

    effect(x, y) {
        return `transform: rotate3d(${150 - y}, ${x - 150}, 0, 25deg)`
    }


})