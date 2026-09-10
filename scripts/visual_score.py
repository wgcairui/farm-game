#!/usr/bin/env python3
"""Reproducible visual similarity scorer for farm design renders.

This is an engineering comparison aid, not a design acceptance gate.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from numpy.lib.stride_tricks import sliding_window_view


def gaussian_kernel(size: int = 11, sigma: float = 1.5) -> np.ndarray:
    axis = np.arange(size, dtype=np.float64) - size // 2
    vector = np.exp(-(axis**2) / (2.0 * sigma**2))
    kernel = np.outer(vector, vector)
    return kernel / kernel.sum()


def convolve_valid(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    windows = sliding_window_view(image, kernel.shape)
    return np.einsum("ijkl,kl->ij", windows, kernel, optimize=True)


def ssim(reference: Image.Image, candidate: Image.Image) -> float:
    first = np.asarray(reference.convert("L"), dtype=np.float64)
    second = np.asarray(candidate.convert("L"), dtype=np.float64)
    height = min(first.shape[0], second.shape[0])
    width = min(first.shape[1], second.shape[1])
    first = first[:height, :width]
    second = second[:height, :width]

    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    kernel = gaussian_kernel()
    mean_first = convolve_valid(first, kernel)
    mean_second = convolve_valid(second, kernel)
    mean_first_sq = mean_first**2
    mean_second_sq = mean_second**2
    mean_both = mean_first * mean_second
    variance_first = convolve_valid(first**2, kernel) - mean_first_sq
    variance_second = convolve_valid(second**2, kernel) - mean_second_sq
    covariance = convolve_valid(first * second, kernel) - mean_both
    score_map = ((2 * mean_both + c1) * (2 * covariance + c2)) / (
        (mean_first_sq + mean_second_sq + c1)
        * (variance_first + variance_second + c2)
    )
    return float(score_map.mean())


def pixel_similarity(reference: Image.Image, candidate: Image.Image) -> float:
    first = np.asarray(reference.convert("RGB").resize((400, 800)), dtype=np.float64)
    second = np.asarray(candidate.convert("RGB").resize((400, 800)), dtype=np.float64)
    return 1.0 - float(np.abs(first - second).mean() / 255.0)


def channel_histogram_similarity(reference: Image.Image, candidate: Image.Image) -> float:
    first = np.asarray(reference.convert("RGB").resize((200, 400)))
    second = np.asarray(candidate.convert("RGB").resize((200, 400)))
    similarities = []
    for channel in range(3):
        first_hist, _ = np.histogram(first[:, :, channel], bins=32, range=(0, 256))
        second_hist, _ = np.histogram(second[:, :, channel], bins=32, range=(0, 256))
        first_hist = first_hist / max(first_hist.sum(), 1)
        second_hist = second_hist / max(second_hist.sum(), 1)
        similarities.append(float(np.sqrt(first_hist * second_hist).sum()))
    return float(np.mean(similarities))


def gradient_similarity(reference: Image.Image, candidate: Image.Image) -> float:
    first = np.asarray(reference.convert("L").resize((400, 800)), dtype=np.float64)
    second = np.asarray(candidate.convert("L").resize((400, 800)), dtype=np.float64)
    first_x, first_y = np.diff(first, axis=1), np.diff(first, axis=0)
    second_x, second_y = np.diff(second, axis=1), np.diff(second, axis=0)
    x_error = np.abs(first_x - second_x).mean()
    y_error = np.abs(first_y - second_y).mean()
    return max(0.0, 1.0 - float((x_error + y_error) / 200.0))


def score(reference_path: Path, candidate_path: Path) -> dict[str, float]:
    reference = Image.open(reference_path).convert("RGB")
    candidate = Image.open(candidate_path).convert("RGB")
    if candidate.size != reference.size:
        candidate = candidate.resize(reference.size, Image.Resampling.LANCZOS)

    values = {
        "ssim": ssim(reference, candidate),
        "pixel": pixel_similarity(reference, candidate),
        "color": channel_histogram_similarity(reference, candidate),
        "gradient": gradient_similarity(reference, candidate),
    }
    values["composite"] = sum(values.values()) / 4.0
    return values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidates", nargs="+", type=Path)
    args = parser.parse_args()

    print(f"{'file':<28} {'SSIM':>8} {'pixel':>8} {'color':>8} {'gradient':>10} {'composite':>11}")
    for candidate in args.candidates:
        values = score(args.reference, candidate)
        print(
            f"{candidate.name:<28}"
            f" {values['ssim'] * 100:7.2f}%"
            f" {values['pixel'] * 100:7.2f}%"
            f" {values['color'] * 100:7.2f}%"
            f" {values['gradient'] * 100:9.2f}%"
            f" {values['composite'] * 100:10.2f}%"
        )


if __name__ == "__main__":
    main()
