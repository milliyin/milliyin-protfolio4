---
title: Building an SMS Spam Classifier with PyTorch
description: Step-by-step guide to training a binary SMS spam classifier using PyTorch and a Hugging Face tokenizer.
createdAt: 2025-07-17
updatedAt: 2025-07-17
category: NLP
readingTime: 3 min read
heroImage: /blog/sms-spam-classifier-pytorch-og.png
heroAlt: Building an SMS Spam Classifier with PyTorch
tags:
  - PyTorch
  - Spam Detection
  - NLP
  - Machine Learning
---

## Introduction

I recently built a simple **SMS spam classifier** using **PyTorch**, **Scikit-learn**, and the Hugging Face `sms_spam` dataset. This project focused on training a logistic-regression-style neural network to detect whether an SMS message is spam or ham with high accuracy.

The motivation was to understand the full pipeline of an NLP binary classification task using my own code and model flow instead of depending entirely on large pre-trained transformers.

## Model Architecture and Workflow

The neural network, `CircleModelV0`, consists of:

- **Input Layer**: 8713 features derived from `CountVectorizer` applied to SMS text
- **Hidden Layer**: 64 neurons with ReLU activation
- **Output Layer**: 1 sigmoid-style binary output for spam vs. ham

This kept the project simple enough to reason about while still covering the full PyTorch training loop.

## Training Workflow

### 1. Dataset Loading

The dataset was loaded using Hugging Face's `datasets` library and contains **5,574 SMS messages** labeled as spam or ham.

### 2. Preprocessing with Scikit-learn

The SMS texts were converted into numerical vectors using **CountVectorizer**, which produced an 8713-dimensional sparse feature space.

### 3. Data Preparation for PyTorch

After vectorization, both features and labels were converted into tensors so they could move through a standard PyTorch training loop.

### 4. Model Definition and Training

The main training flow handled forward passes, loss calculation, backpropagation, optimizer updates, and simple accuracy tracking.

```python
for epoch in range(1000):
    model.train()
    optimizer.zero_grad()
    preds = model(X_train_t)
    loss = criterion(preds, y_train_t)
    loss.backward()
    optimizer.step()

    if epoch % 10 == 0:
        acc = ((preds > 0.5).float() == y_train_t).float().mean()
        print(f"Epoch {epoch} | Loss: {loss.item():.4f} | Acc: {acc:.4f}")
```

### 5. Saving the Model and Vectorizer

Once training was complete, I saved both the model weights and the fitted vectorizer so the exact same preprocessing path could be reused later during inference.

```python
import pickle

torch.save(model.state_dict(), "full_model.pth")
with open("vectorizer.pkl", "wb") as f:
    pickle.dump(vectorizer, f)
```

## Running Inference

A separate `inference.py` script loads the saved model and vectorizer for quick predictions:

```python
import torch
import pickle
from model import CircleModelV0

with open("vectorizer.pkl", "rb") as f:
    vectorizer = pickle.load(f)

model = CircleModelV0(input_size=8713)
model.load_state_dict(torch.load("full_model.pth"))
model.eval()

def predict(text: str) -> str:
    X = torch.FloatTensor(vectorizer.transform([text]).toarray())
    with torch.no_grad():
        prob = model(X).item()
    return "Spam" if prob > 0.5 else "Ham"

print(predict("you have won a free prize"))
print(predict("hey are you free tonight?"))
```

## Project Repository

Complete code, training, and inference scripts:

[milliyin/sms-spam-model-train](https://github.com/milliyin/sms-spam-model-train)

## Benefits of This Project

1. **Hands-on PyTorch Training**: Implemented a neural network from scratch without pre-built classifiers.
2. **Clear NLP Workflow Understanding**: Learned how to process text into model-ready tensors.
3. **Efficient Inference Pipeline**: Reused the trained model and vectorizer through a small prediction script.
4. **Utilized Public Datasets**: Used Hugging Face datasets for reproducible experimentation.

## Conclusion

This SMS spam classification project deepened my understanding of NLP preprocessing, PyTorch model training, and practical deployment pipelines. Projects like this help bridge the gap between theory and real model-building workflows.
