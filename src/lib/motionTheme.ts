export const motionTheme={
  transition:{
    snap:{type:'spring',stiffness:720,damping:48,mass:.7},
    ui:{type:'spring',stiffness:360,damping:34,mass:.85},
    gentle:{type:'spring',stiffness:180,damping:26,mass:1},
    ambient:{type:'spring',stiffness:90,damping:22,mass:1.15}
  },
  stagger:{tight:.035,base:.065,relaxed:.11},
  travel:{hover:2,enter:18,section:32}
} as const

export const MOTION_REDUCED_QUERY='(prefers-reduced-motion: reduce)'
