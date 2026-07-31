export function ResortBackdrop() {
  return (
    <div className="resort-backdrop" aria-hidden="true">
      <div className="resort-sky" />
      <div className="resort-haze" />
      <div className="resort-sea">
        <div className="resort-wave resort-wave-a" />
        <div className="resort-wave resort-wave-b" />
        <div className="resort-wave resort-wave-c" />
      </div>
      <div className="resort-sand" />
      <svg className="resort-palms" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice">
        <g className="palm palm-left">
          <path
            className="palm-trunk"
            d="M210 700 C200 560 230 430 245 300 C250 260 248 220 252 190"
          />
          <g className="palm-fronds">
            <path d="M252 190 C180 150 110 170 70 210" />
            <path d="M252 190 C200 120 160 90 130 70" />
            <path d="M252 190 C260 100 290 60 340 40" />
            <path d="M252 190 C320 140 380 150 430 190" />
            <path d="M252 190 C300 200 350 230 380 270" />
            <path d="M252 190 C210 210 170 250 150 300" />
          </g>
        </g>
        <g className="palm palm-right">
          <path
            className="palm-trunk"
            d="M980 700 C995 540 960 420 940 300 C932 250 938 210 930 175"
          />
          <g className="palm-fronds">
            <path d="M930 175 C860 130 800 140 760 175" />
            <path d="M930 175 C880 90 850 55 820 30" />
            <path d="M930 175 C960 80 1010 45 1060 35" />
            <path d="M930 175 C1010 120 1070 140 1110 185" />
            <path d="M930 175 C990 200 1035 240 1055 285" />
            <path d="M930 175 C880 205 840 250 820 300" />
          </g>
        </g>
        <g className="palm palm-mid">
          <path
            className="palm-trunk"
            d="M620 700 C615 580 640 470 650 380 C655 340 650 300 655 270"
          />
          <g className="palm-fronds">
            <path d="M655 270 C600 235 555 245 520 275" />
            <path d="M655 270 C620 200 600 170 575 145" />
            <path d="M655 270 C680 195 720 170 760 160" />
            <path d="M655 270 C715 240 760 255 790 290" />
          </g>
        </g>
      </svg>
    </div>
  );
}
