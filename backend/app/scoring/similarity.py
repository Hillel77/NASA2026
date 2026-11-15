"""
Parameter-specific similarity functions. Every function maps Earth values (numpy arrays,
NaN = missing) to a similarity in [0, 1]; NaN is propagated so that missing data are
handled by the confidence model and never silently scored as 0.
"""
from __future__ import annotations

import math

import numpy as np


def gaussian(x: np.ndarray, target: float, sigma: float) -> np.ndarray:
    """s = exp(-(x - t)^2 / (2 sigma^2))  — symmetric tolerance around the target."""
    return np.exp(-((x - target) ** 2) / (2.0 * sigma ** 2))


def log_gaussian(x: np.ndarray, target: float, sigma_ln: float, floor: float = 1e-3) -> np.ndarray:
    """Gaussian in log space: appropriate for scale quantities (relief, roughness, pressure)
    whose plausible values span orders of magnitude. sigma_ln = 0.7 ~ factor-of-2 tolerance."""
    lx = np.log(np.maximum(x, floor))
    lt = math.log(max(target, floor))
    return np.exp(-((lx - lt) ** 2) / (2.0 * sigma_ln ** 2))


def pair_gaussian(xa: np.ndarray, xb: np.ndarray, ta: float, tb: float, sigma: float) -> np.ndarray:
    """Geometric mean of two Gaussian similarities (e.g. min AND max temperature both matter)."""
    return np.sqrt(gaussian(xa, ta, sigma) * gaussian(xb, tb, sigma))


def preference_within(x: np.ndarray, ideal_max: float, sigma: float) -> np.ndarray:
    """Logistics preference: 1 when x <= ideal_max, Gaussian decay beyond it."""
    over = np.maximum(x - ideal_max, 0.0)
    return np.exp(-(over ** 2) / (2.0 * sigma ** 2))


def preference_beyond(x: np.ndarray, ideal_min: float, sigma: float) -> np.ndarray:
    """Remoteness preference (isolation studies): 1 when x >= ideal_min."""
    under = np.maximum(ideal_min - x, 0.0)
    return np.exp(-(under ** 2) / (2.0 * sigma ** 2))


def lognormal_bin_probs(median: float, p90: float, edges: np.ndarray) -> np.ndarray:
    """Discretise a log-normal slope distribution (given median and 90th percentile, which is
    how planetary slope statistics are usually reported) onto histogram bin edges."""
    from scipy.stats import norm
    mu = math.log(max(median, 1e-3))
    sd = max((math.log(max(p90, median * 1.01)) - mu) / norm.ppf(0.9), 1e-3)
    e = np.maximum(edges.astype(np.float64), 1e-9)
    cdf = norm.cdf((np.log(e) - mu) / sd)
    cdf[0] = 0.0
    cdf[-1] = 1.0
    return np.diff(cdf)


def bhattacharyya(hist: np.ndarray, target_probs: np.ndarray) -> np.ndarray:
    """Distribution overlap BC = sum_k sqrt(p_k q_k), in [0, 1]. hist: (bins, n) percents.
    Compares the WHOLE slope distribution, not just its mean."""
    p = hist / np.maximum(np.nansum(hist, 0, keepdims=True), 1e-9)
    bc = np.nansum(np.sqrt(np.clip(p, 0, None) * target_probs[:, None]), 0)
    bc[~np.isfinite(hist).all(0) | (np.nansum(hist, 0) <= 0)] = np.nan
    return np.clip(bc, 0, 1)


def bhattacharyya_single(hist: np.ndarray, target_probs: np.ndarray) -> float:
    p = hist / max(float(np.sum(hist)), 1e-9)
    return float(np.clip(np.sum(np.sqrt(np.clip(p, 0, None) * target_probs)), 0, 1))
