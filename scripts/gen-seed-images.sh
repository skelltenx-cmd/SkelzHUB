#!/bin/bash
# Generate demo images for SkelzHub seed content
DIR=/home/z/my-project/assets/seed
mkdir -p "$DIR"

declare -a NAMES=(
  "meme_cat"
  "meme_doge"
  "meme_coffee_cat"
  "meme_hamster"
  "meme_duck"
  "cafe"
  "bali"
  "mountain"
  "neon"
  "nasgor"
  "lofi"
  "skate"
)

declare -a PROMPTS=(
  "Funny orange tabby cat wearing black sunglasses, leaning cool against pastel wall, meme style photography, studio lighting, high quality, detailed"
  "Shiba Inu dog wearing tiny colorful party hat looking confused and surprised, funny pet portrait photography, studio lighting, high quality"
  "Cartoon illustration of a tired cat sitting at laptop with coffee cup, office humor meme, vibrant flat illustration, high quality"
  "Dramatic close-up photo of hamster holding tiny snack with both paws eating, adorable, studio lighting, high quality"
  "Rubber duck wearing sunglasses floating on swimming pool with colorful floaties, summer vibes, photography, high quality"
  "Flat lay of iced coffee, croissant and flowers on wooden table, aesthetic cafe photography, natural light, high quality"
  "Bali beach at golden hour sunset, palm trees silhouette, dramatic orange sky, travel photography, high quality, detailed"
  "Hiker standing on mountain summit above sea of clouds at sunrise, adventure photography, epic view, high quality"
  "Neon lit narrow alley at night, purple and red neon signs, cinematic moody street photography, high quality"
  "Indonesian nasi goreng fried rice with fried egg and crackers on banana leaf, top view food photography, high quality, detailed"
  "Cozy rainy window with steaming coffee mug on sill, lofi aesthetic, warm tones, photography, high quality"
  "Skateboarder silhouette mid air trick against orange sunset sky, urban sports photography, high quality"
)

for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  prompt="${PROMPTS[$i]}"
  out="$DIR/${name}.png"
  if [ -f "$out" ]; then
    echo "SKIP $name (exists)"
    continue
  fi
  echo "GEN  $name ..."
  for attempt in 1 2 3; do
    if z-ai image -p "$prompt" -o "$out" -s 1024x1024 > /dev/null 2>&1; then
      if [ -f "$out" ]; then
        echo "OK   $name (attempt $attempt)"
        break
      fi
    fi
    echo "RETRY $name attempt $attempt failed"
    sleep 3
  done
done

echo "DONE"
ls -la "$DIR"
