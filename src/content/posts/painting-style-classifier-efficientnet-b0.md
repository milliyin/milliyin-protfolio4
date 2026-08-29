---
title: EfficientNet Painting Style Detection Guide
description: How I fine-tuned EfficientNet-B0 on a painting dataset to classify artistic styles with high accuracy.
createdAt: 2025-08-15
updatedAt: 2025-08-15
category: Computer Vision
readingTime: 3 min read
heroImage: /blog/painting-style-classifier-efficientnet-b0-og.png
heroAlt: EfficientNet Painting Style Detection Guide
tags:
  - PyTorch
  - Computer Vision
  - Image Classification
  - EfficientNet
---

## Introduction

I fine-tuned **EfficientNet-B0** to classify artworks into **9 painting styles** using the Hugging Face dataset `keremberke/painting-style-classification`. The goal was to build a complete custom PyTorch pipeline covering dataset preparation, augmentation, transfer learning, and evaluation so I could better understand what helps and what limits accuracy on this task.

Model card: [milliyin/painting-style-classification](https://huggingface.co/milliyin/painting-style-classification)

## Dataset Preparation

The dataset was downloaded directly from Hugging Face in ZIP format for train, validation, and test splits. The structure looked like this:

```text
dataset/
  images/train
  images/validation
  images/test
  jsonl/train.jsonl
  jsonl/validation.jsonl
  jsonl/test.jsonl
```

Images were extracted, renamed with zero-padded IDs, and assigned numeric labels based on their folder names. I generated `.jsonl` metadata for each split and used a custom `FolderDataset` loader to read those files. A second wrapper, `PaintingDataset`, applied image transforms and returned `(image, label)` pairs for PyTorch.

## Data Augmentation

For **training**:

- Resize to `224x224`
- Random horizontal flip with 50% probability
- Random rotation up to 15 degrees
- Color jitter for brightness, contrast, saturation, and hue
- Random affine translation
- ImageNet normalization

For **validation** and **test**, I kept only resizing and normalization.

## Model Architecture

I started from `torchvision.models.efficientnet_b0` with ImageNet pretrained weights and replaced the final classifier with:

- Dropout at `0.2`
- A fully connected layer for 9 output classes

## Transfer Learning Strategy

To reduce catastrophic forgetting and let the new classifier head adapt first, I froze layers up to roughly layer 100 at the start. Then I gradually unfroze the network:

- Epoch 10: `freeze_until_layer=50`
- Epoch 20: unfreeze all layers for full fine-tuning

This staged unfreezing gave the backbone time to adapt instead of changing everything at once.

## Training Setup

```python
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=0.01)
scheduler = ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=5)
```

- **Batch size**: 32
- **Epochs**: 50
- **Device**: CUDA

The training loop tracked train loss, train accuracy, validation loss, and validation accuracy. Whenever validation accuracy improved, I saved the model checkpoint as `best_efficientnet_b0.pth`.

## Evaluation & Results

Best validation accuracy achieved:

**60.15% after 50 epochs**

I also generated a classification report and plotted training curves to inspect overfitting behavior. Inference on individual images used the top prediction plus a confidence score.

## Why Did It Plateau Around ~60%?

1. **High Inter-Class Similarity**: Some styles, such as Romanticism and Realism, overlap visually.
2. **Label Noise**: Open datasets can contain inconsistent labels.
3. **Data Imbalance**: Some classes had fewer samples and learned less evenly.
4. **Limited Early Unfreezing**: Freezing too much for too long slowed domain adaptation.
5. **Moderate Augmentation**: Stronger augmentation could help with scan and framing variation.
6. **Model Size**: EfficientNet-B0 is compact for a subtle classification problem like painting style detection.

## How to Improve

- **Earlier & Gradual Unfreezing**: Let the backbone adapt sooner.
- **Stronger Augmentations**: Try RandAugment, CutMix, Mixup, or stronger color-space changes.
- **Class-Balanced Sampling**: Reduce bias toward larger classes.
- **Bigger Backbone**: Test EfficientNet-B2/B3, ConvNeXt-Tiny, or ViT models.
- **Curated Splits**: Avoid artist overlap between train and validation.
- **TTA & Ensembling**: Use prediction averaging for incremental gains.

## Code Link

Complete training pipeline, dataset processing, and fine-tuning notebook:

[painting-style-classification-finetune/finetune.ipynb](https://github.com/milliyin/painting-style-classification-finetune/blob/main/finetune.ipynb)

## Conclusion

This project gave me a practical look at fine-grained image classification for paintings. A baseline around 60 percent was useful, but the real value came from seeing exactly where augmentation, backbone size, and layer-unfreezing strategy can move the model further.
