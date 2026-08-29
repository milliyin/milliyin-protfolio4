---
title: Flux 1 In Context Learning
metaTitle: Flux 1 In Context Learning | Milliyin
description: Training workflow for FLUX pixel-art character consistency with LoRA.
metaDescription: A FLUX.1 LoRA case study covering pixel-art character generation, quickstart usage, training setup, evaluation, and practical limitations.
featured: true
createdAt: 2025-08-26
repo: https://github.com/milliyin/Flux.1-In-Context-Learning
heroImage: /flux-pixel-art-03.png
heroAlt: FLUX pixel art character example
---

## Project Overview

This project adapts FLUX.1 to generate retro pixel-art characters with clean silhouettes and limited palettes. The goal was a reusable LoRA workflow for game assets and fast prototyping.

## Examples

Three local examples from the workflow:

<figure class="project-example">
  <img class="project-example-image" src="/flux-pixel-art-03.png" alt="FLUX pixel art example with red hair and gray armor" loading="eager" />
  <figcaption><code>pixel art character, red hair, gray armor, no weapon, facing forward</code></figcaption>
</figure>

<figure class="project-example">
  <img class="project-example-image" src="/flux-pixel-art-05.png" alt="FLUX pixel art example with red hair and brown armor" loading="lazy" />
  <figcaption><code>pixel art character, red hair, brown armor, no weapon, facing forward</code></figcaption>
</figure>

<figure class="project-example">
  <img class="project-example-image" src="/flux-pixel-art-07.png" alt="FLUX pixel art example with brown hair and blue clothing" loading="lazy" />
  <figcaption><code>pixel art character, brown hair, blue clothing, no weapon, facing forward</code></figcaption>
</figure>

## Quickstart

This is the core Diffusers setup used to load the base FLUX model and the LoRA adapter:

```python
import torch
from diffusers import FluxPipeline

pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    torch_dtype=torch.float16
).to("cuda")

pipe.load_lora_weights("milliyin/pixel_art_characters_lora_flux_nf4")

prompt = "pixel art, rpg adventurer, green cloak, clean outline, limited palette, facing forward"
image = pipe(
    prompt=prompt,
    negative_prompt="blurry, low quality, distorted, ugly",
    height=512,
    width=512,
    guidance_scale=7.5,
    num_inference_steps=50,
).images[0]

image.save("sample.png")
```

## Prompting Tips

- Use compact prompts like `pixel art, [role/class], [palette cue], facing forward`
- Add presentation cues such as `clean outline`, `limited palette`, `8-bit`, or `sprite sheet style`
- Use a negative prompt to suppress blur, noise, distortion, and photographic artifacts

## Non-Technical Overview

- **What this is**: A small LoRA add-on that teaches FLUX how to draw pixel-art characters
- **Why LoRA**: It changes the style without retraining the full base model, so the workflow is faster and cheaper
- **What you need**: The base FLUX model, the LoRA adapter, and a short prompt
- **Who it helps**: Indie developers, artists, and prototypers who want consistent characters quickly

## Technical Details

### Data Pipeline

- Dataset: `haidarazmi/lora-pixel-art-characters-datases`
- Resolution: `512x512` with resize and random crop
- Conditioning: precomputed text embeddings loaded from Parquet and aligned by image hash
- Batch strategy: `train_batch_size = 1` with gradient accumulation to avoid out-of-memory issues

### Model & Adapters

- Base model: `black-forest-labs/FLUX.1-dev`
- Trainable layers: attention adapters in `to_q`, `to_k`, `to_v`, and `to_out.0`
- LoRA rank: `r = 4`
- Quantization: NF4 via bitsandbytes to reduce VRAM during training

### Objective & Scheduler

- Scheduler: `FlowMatchEulerDiscreteScheduler`
- Loss: weighted MSE on the velocity target
- Guidance: pooled and text embeddings for conditioning

### Optimizer & Precision

- Optimizer: `AdamW8bit`
- Learning rate: `1e-4`
- Precision: FP16 mixed precision
- Gradient clipping: `1.0`

### Latent Caching

Encoded latents are cached once with the VAE, then the VAE is freed so the rest of training can reuse those latents without repeating expensive encoding work.

## Key Hyperparameters

```text
width=512, height=512
rank=4
learning_rate=1e-4
train_batch_size=1
gradient_accumulation_steps=4
max_train_steps=700
mixed_precision=fp16
checkpointing_steps=100
guidance_scale=1.0
device=NVIDIA A100
```

## Evaluation & Results

- **Goal**: stylistic consistency, clean silhouettes, and readable armor or clothing at 1x zoom
- **What worked best**: prompts around 5 to 15 tokens produced the most stable sprite-like outputs
- **Failure cases**: long prompts drifted toward full-frame art, while very high guidance introduced aliasing and non-pixel textures

The biggest win here was consistency. The model stayed much closer to the intended sprite style once the prompt stayed short and the LoRA handled the style specialization.

## Limitations

- The style is tuned mostly for single, front-facing characters
- It may reproduce dataset biases in pose, attire, and palette choices
- The original dataset/license constraints matter for usage decisions

## Plain-English Walkthrough

1. Start from FLUX, which is the base image model.
2. Add a small LoRA adapter that learns pixel-art rules.
3. Feed it many labeled pixel-art characters.
4. Let the adapter learn the recurring style patterns.
5. Load FLUX plus the adapter later and generate new characters from short prompts.

## Why It Matters

This project turns style tuning into something practical and reusable. Instead of retraining a full model, it shows how a compact LoRA can produce a consistent visual style that is actually usable for game-art style outputs and quick creative iteration.

## Links

- Adapter: [milliyin/pixel_art_characters_lora_flux_nf4](https://huggingface.co/milliyin/pixel_art_characters_lora_flux_nf4)
- Source code: [milliyin/Flux.1-In-Context-Learning](https://github.com/milliyin/Flux.1-In-Context-Learning)

## What I Learned

This project reinforced a few practical lessons:

- shorter prompts usually outperform over-detailed prompting in style-tuned image workflows
- LoRA training becomes much more useful when the evaluation is systematic
- latent caching and compact adapters make experimentation much cheaper
- image generation quality depends on both training discipline and prompt discipline
