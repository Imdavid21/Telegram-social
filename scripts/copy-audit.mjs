import fs from 'node:fs'
import path from 'node:path'

const files = [
  'src/components/LandingPage.tsx',
  'src/ProductApp.tsx',
  'src/components/AuthModal.tsx',
  'src/components/FeedCard.tsx',
  'src/components/SponsoredCard.tsx',
  'src/components/MediaRenderer.tsx',
  'public/privacy.html',
  'public/terms.html'
]

const banned = [
  'revolutionary','revolutionize','game-changing','game changer','next-generation','next generation','cutting-edge','cutting edge','state-of-the-art','state of the art','best-in-class','world-class','industry-leading','industry leading','leading-edge','leading edge','groundbreaking','breakthrough','transformative','disruptive','unparalleled','unmatched','unprecedented','unrivaled','unbeatable','exceptional','extraordinary','remarkable','incredible','amazing','awesome','stunning','breathtaking','beautifully designed','elegantly designed','meticulously crafted','carefully crafted','thoughtfully crafted','crafted for you','designed for you','built for you','made for you','tailored to your needs','tailored for you','personalized experience','seamless','seamlessly','effortless','effortlessly','frictionless','hassle-free','hassle free','stress-free','stress free','intuitive and easy','simple and intuitive','easy-to-use','easy to use','user-friendly','user friendly','powerful and intuitive','powerful yet simple','simple yet powerful','all-in-one','all in one','one-stop shop','one stop shop','everything you need','everything in one place','at your fingertips','in the palm of your hand','unlock the power','unlock your potential','unlock new possibilities','supercharge','turbocharge','level up','elevate your','take your .* to the next level','redefine','reimagine','reinvent','future of','future-proof','future proof','built for the future','modern solution','innovative solution','robust solution','comprehensive solution','holistic solution','scalable solution','enterprise-grade','enterprise grade','mission-critical','mission critical','end-to-end','end to end','full-stack solution','full stack solution','ecosystem of','suite of tools','rich feature set','feature-rich','feature rich','advanced capabilities','smart solution','intelligent solution','AI-powered','AI powered','powered by AI','leverage AI','leverage the power','harness the power','utilize','utilizing','delve','dive deep','deep dive','explore the world of','embark on','journey','navigate the complexities','ever-evolving','ever changing landscape','fast-paced world','digital age','today’s world','today\'s world','in today’s','in today\'s','when it comes to','it is important to note','it’s important to note','it\'s important to note','needless to say','as we all know','without further ado','look no further','you’ve come to the right place','you\'ve come to the right place','whether you’re','whether you\'re','from .* to .* and everything in between','not just .* but','more than just','at its core','at the heart of','the key is','the bottom line','in conclusion','to sum up','ultimately','moreover','furthermore','additionally','in addition to','with that said','that being said','this means that','the result\?','the answer\?','why it matters','what this means for you','imagine a world','picture this','meet the','say hello to','introducing the','welcome to the future','welcome to','your new .* starts here','ready to','get started today','start your journey','join thousands','join millions','trusted by','loved by','built with love','made with love','we believe','our mission','our vision','our goal is to','we are committed to','we strive to','we’re passionate','we\'re passionate','we’re excited','we\'re excited','we’re thrilled','we\'re thrilled','we’re proud','we\'re proud','we can’t wait','we can\'t wait','changing the way','changing how','transform the way','streamline your','optimize your','maximize your','boost your','enhance your','empower','empowering','enable you to','helps you to','allows you to easily','easily manage','effortlessly manage','with ease','in seconds','in minutes','with just a few clicks','one click','one-click','magic','magical','wizard','copilot for','assistant for everything','your personal','your ultimate','ultimate guide','ultimate tool','ultimate platform','ultimate experience','premium experience','immersive experience','delightful experience','delightful','delight','beautiful experience','clean and modern','sleek and modern','minimal and elegant','sleek interface','modern interface','clean interface','blazing fast','lightning fast','ultra-fast','ultra fast','instantaneous','zero friction','zero effort','zero hassle','no-brainer','no brainer','obsess over','obsessed with','pixel-perfect','pixel perfect','crafted to perfection','built from the ground up','built from scratch','purpose-built','purpose built','designed from the ground up','the possibilities are endless','endless possibilities','limitless','boundless','without limits','like never before','never been easier','couldn’t be easier','could not be easier','finally, a','finally a','the only .* you need','the last .* you’ll ever need','the last .* you will ever need'
]

const regexes = banned.map(value => new RegExp(value, 'i'))
const violations = []

for (const file of files) {
  const absolute = path.resolve(file)
  if (!fs.existsSync(absolute)) continue
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line.includes('—')) violations.push({ file, line: index + 1, phrase: 'em dash' })
    regexes.forEach((regex, i) => {
      if (regex.test(line)) violations.push({ file, line: index + 1, phrase: banned[i] })
    })
  })
}

if (violations.length) {
  console.error(`Copy audit failed with ${violations.length} issue${violations.length === 1 ? '' : 's'}:`)
  for (const issue of violations.slice(0, 60)) console.error(`- ${issue.file}:${issue.line} -> ${issue.phrase}`)
  if (violations.length > 60) console.error(`- plus ${violations.length - 60} more`)
  process.exit(1)
}

console.log(`Copy audit passed across ${files.length} user-facing files with ${banned.length} anti-slop checks.`)
