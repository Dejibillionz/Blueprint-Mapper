const FADE_TAU = 0.6; // time-constant for setTargetAtTime crossfade (~1.8s 95% done)

interface NoteSpec {
  freq: number;
  type: OscillatorType;
  gain: number;
}

interface RoomProfile {
  roomId: string;
  notes: NoteSpec[];
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  masterGain: number;
  lfoFreq: number;
  lfoDepth: number;
}

const PROFILES: RoomProfile[] = [
  {
    roomId: "room_1",
    notes: [
      { freq: 87.3, type: "sine", gain: 0.70 },
      { freq: 174.6, type: "sine", gain: 0.24 },
      { freq: 130.8, type: "sine", gain: 0.16 },
    ],
    filterType: "lowpass", filterFreq: 340, filterQ: 1.4,
    masterGain: 0.18, lfoFreq: 0.07, lfoDepth: 5,
  },
  {
    roomId: "room_2",
    notes: [
      { freq: 110.0, type: "triangle", gain: 0.62 },
      { freq: 220.0, type: "triangle", gain: 0.22 },
      { freq: 165.0, type: "sine",     gain: 0.20 },
    ],
    filterType: "lowpass", filterFreq: 600, filterQ: 1.0,
    masterGain: 0.16, lfoFreq: 0.11, lfoDepth: 4,
  },
  {
    roomId: "room_3",
    notes: [
      { freq: 73.4, type: "sine",      gain: 0.75 },
      { freq: 110.0, type: "sawtooth", gain: 0.07 },
      { freq: 146.8, type: "sine",     gain: 0.22 },
    ],
    filterType: "lowpass", filterFreq: 260, filterQ: 2.0,
    masterGain: 0.17, lfoFreq: 0.06, lfoDepth: 7,
  },
  {
    roomId: "room_4",
    notes: [
      { freq: 49.0,  type: "sine",      gain: 0.86 },
      { freq: 98.0,  type: "sine",      gain: 0.28 },
      { freq: 73.4,  type: "sawtooth",  gain: 0.06 },
    ],
    filterType: "lowpass", filterFreq: 180, filterQ: 2.0,
    masterGain: 0.20, lfoFreq: 0.05, lfoDepth: 8,
  },
  {
    roomId: "room_5",
    notes: [
      { freq: 330.0, type: "sine", gain: 0.40 },
      { freq: 440.0, type: "sine", gain: 0.30 },
      { freq: 550.0, type: "sine", gain: 0.18 },
      { freq: 660.0, type: "sine", gain: 0.10 },
    ],
    filterType: "bandpass", filterFreq: 2400, filterQ: 0.8,
    masterGain: 0.13, lfoFreq: 0.22, lfoDepth: 2,
  },
  {
    roomId: "corridor",
    notes: [
      { freq: 65.4, type: "sine", gain: 0.65 },
      { freq: 98.0, type: "sine", gain: 0.28 },
    ],
    filterType: "lowpass", filterFreq: 460, filterQ: 1.0,
    masterGain: 0.12, lfoFreq: 0.09, lfoDepth: 5,
  },
  {
    roomId: "entrance_hall",
    notes: [
      { freq: 32.7, type: "sine",     gain: 0.85 },
      { freq: 49.0, type: "sine",     gain: 0.38 },
      { freq: 65.4, type: "triangle", gain: 0.27 },
      { freq: 82.4, type: "sine",     gain: 0.14 },
    ],
    filterType: "lowpass", filterFreq: 280, filterQ: 1.5,
    masterGain: 0.22, lfoFreq: 0.055, lfoDepth: 9,
  },
  {
    roomId: "ticket_info",
    notes: [
      { freq: 220.0, type: "sine", gain: 0.55 },
      { freq: 261.6, type: "sine", gain: 0.32 },
    ],
    filterType: "lowpass", filterFreq: 900, filterQ: 1.0,
    masterGain: 0.10, lfoFreq: 0.16, lfoDepth: 3,
  },
  {
    roomId: "gift_shop",
    notes: [
      { freq: 196.0, type: "triangle", gain: 0.52 },
      { freq: 247.0, type: "triangle", gain: 0.33 },
      { freq: 294.0, type: "triangle", gain: 0.18 },
    ],
    filterType: "lowpass", filterFreq: 1100, filterQ: 1.0,
    masterGain: 0.14, lfoFreq: 0.19, lfoDepth: 3,
  },
];

interface Voice {
  gainNode: GainNode;
  maxGain: number;
}

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private currentRoomId: string | null = null;

  /** Call once on first user gesture (pointer lock). */
  start(): void {
    if (this.ctx) {
      // Resume if suspended (e.g. browser autoplay policy)
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);
    this._buildAllVoices();
  }

  private _buildAllVoices(): void {
    const ctx = this.ctx!;
    const out = this.masterGain!;

    for (const profile of PROFILES) {
      // Per-voice gain (starts silent)
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0;
      voiceGain.connect(out);

      // Tone-shaping filter
      const filter = ctx.createBiquadFilter();
      filter.type = profile.filterType;
      filter.frequency.value = profile.filterFreq;
      filter.Q.value = profile.filterQ;
      filter.connect(voiceGain);

      // Slow LFO adds subtle movement to pitch
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = profile.lfoFreq;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = profile.lfoDepth;
      lfo.connect(lfoGain);
      lfo.start();

      // Oscillator stack
      for (const note of profile.notes) {
        const osc = ctx.createOscillator();
        osc.type = note.type;
        osc.frequency.value = note.freq;
        lfoGain.connect(osc.detune); // LFO → detune

        const oscGain = ctx.createGain();
        oscGain.gain.value = note.gain;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();
      }

      this.voices.set(profile.roomId, { gainNode: voiceGain, maxGain: profile.masterGain });
    }
  }

  setRoom(roomId: string | null): void {
    if (!this.ctx) return;
    if (roomId === this.currentRoomId) return;

    const now = this.ctx.currentTime;

    // Fade out previous voice
    if (this.currentRoomId !== null) {
      const prev = this.voices.get(this.currentRoomId);
      if (prev) prev.gainNode.gain.setTargetAtTime(0, now, FADE_TAU);
    }

    this.currentRoomId = roomId;

    // Fade in new voice
    if (roomId !== null) {
      const next = this.voices.get(roomId);
      if (next) next.gainNode.gain.setTargetAtTime(next.maxGain, now, FADE_TAU);
    }
  }

  setMuted(muted: boolean): void {
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.4);
  }

  dispose(): void {
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.voices.clear();
    this.currentRoomId = null;
  }
}
