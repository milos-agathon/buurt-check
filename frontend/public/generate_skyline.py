from __future__ import annotations

from pathlib import Path


SVG_WIDTH = 1024
SVG_HEIGHT = 500
GROUND_Y = 500
OUTPUT_PATH = Path(__file__).with_name("og-image.svg")


def fmt(value: float) -> str:
    text = f"{value:.2f}"
    text = text.rstrip("0").rstrip(".")
    return text or "0"


def attr_value(value: object) -> str:
    if isinstance(value, (int, float)):
        return fmt(float(value))
    return str(value)


def attrs_to_string(**attributes: object) -> str:
    parts = []
    for key, value in attributes.items():
        if value is None:
            continue
        parts.append(f'{key.replace("_", "-")}="{attr_value(value)}"')
    return " ".join(parts)


def element(tag: str, content: str | None = None, **attributes: object) -> str:
    attr_text = attrs_to_string(**attributes)
    if content is None:
        return f"<{tag} {attr_text}/>" if attr_text else f"<{tag}/>"
    return f"<{tag} {attr_text}>{content}</{tag}>" if attr_text else f"<{tag}>{content}</{tag}>"


def point(x: float, y: float) -> str:
    return f"{fmt(x)},{fmt(y)}"


def polygon(points: list[tuple[float, float]], **attributes: object) -> str:
    return element("polygon", None, points=" ".join(point(x, y) for x, y in points), **attributes)


def path(d: str, **attributes: object) -> str:
    return element("path", None, d=d, **attributes)


def rect(x: float, y: float, width: float, height: float, **attributes: object) -> str:
    return element("rect", None, x=x, y=y, width=width, height=height, **attributes)


def line(x1: float, y1: float, x2: float, y2: float, **attributes: object) -> str:
    return element("line", None, x1=x1, y1=y1, x2=x2, y2=y2, **attributes)


def circle(cx: float, cy: float, r: float, **attributes: object) -> str:
    return element("circle", None, cx=cx, cy=cy, r=r, **attributes)


def chimney(x_ratio: float, width_ratio: float = 0.08, height_ratio: float = 0.14) -> dict[str, float]:
    return {"x": x_ratio, "width": width_ratio, "height": height_ratio}


def scale_spec(spec: dict[str, object], scale: float) -> dict[str, object]:
    scaled = dict(spec)
    scaled["width"] = float(spec["width"]) * scale
    scaled["height"] = float(spec["height"]) * scale
    return scaled


def mirror_points(points: list[tuple[float, float]], left_x: float, width: float) -> list[tuple[float, float]]:
    return [(left_x + width - (px - left_x), py) for px, py in reversed(points)]


# ---------------------------------------------------------------------------
# Decorative elements: chimneys, hoists, finials, dormers
# ---------------------------------------------------------------------------


def render_chimney(
    left: float,
    bottom: float,
    width: float,
    height: float,
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    top = bottom - height
    cap_height = max(2.0, width * 0.28)
    cap_overhang = max(0.9, width * 0.12)
    pot_width = max(1.1, width * 0.18)
    pot_height = max(1.2, cap_height * 0.72)
    pot_gap = max(0.8, (width - (2 * pot_width)) / 3)
    pot_y = top - cap_height - pot_height

    parts = [
        rect(left, top, width, height, fill=fill, stroke=stroke, stroke_width=stroke_width * 0.82),
        rect(
            left - cap_overhang,
            top - cap_height,
            width + (cap_overhang * 2),
            cap_height,
            fill=stroke,
            stroke="none",
        ),
        rect(left + pot_gap, pot_y, pot_width, pot_height, fill=stroke, stroke="none"),
        rect(left + (2 * pot_gap) + pot_width, pot_y, pot_width, pot_height, fill=stroke, stroke="none"),
    ]
    return "\n".join(parts)


def render_hoist(center_x: float, peak_y: float, stroke: str, stroke_width: float) -> str:
    mast_top = peak_y - 13
    arm_end = center_x + 8
    hook_y = mast_top + 5
    parts = [
        line(center_x, peak_y + 3, center_x, mast_top, stroke=stroke, stroke_width=stroke_width * 0.82),
        line(center_x, mast_top, arm_end, mast_top, stroke=stroke, stroke_width=stroke_width * 0.82),
        line(arm_end, mast_top, arm_end, hook_y, stroke=stroke, stroke_width=stroke_width * 0.82),
        circle(arm_end, hook_y + 1.4, 1.2, fill="none", stroke=stroke, stroke_width=stroke_width * 0.72),
    ]
    return "\n".join(parts)


def render_finial(
    cx: float,
    peak_y: float,
    stroke: str,
    stroke_width: float,
    style: str = "ball",
) -> str:
    """Decorative ornament at gable peak: ball, spike, or vase."""
    if style == "ball":
        stem_h = 5.5
        ball_r = 2.2
        return "\n".join([
            line(cx, peak_y, cx, peak_y - stem_h, stroke=stroke, stroke_width=stroke_width * 0.7),
            circle(cx, peak_y - stem_h - ball_r, ball_r, fill=stroke, stroke="none"),
        ])
    if style == "spike":
        h = 9
        w = 1.6
        pts = [(cx, peak_y - h), (cx - w, peak_y), (cx + w, peak_y)]
        return polygon(pts, fill=stroke, stroke="none")
    if style == "vase":
        stem_h = 3.5
        return "\n".join([
            line(cx, peak_y, cx, peak_y - stem_h, stroke=stroke, stroke_width=stroke_width * 0.7),
            path(
                f"M {point(cx - 2.2, peak_y - stem_h)} "
                f"Q {point(cx - 3, peak_y - stem_h - 4)} {point(cx, peak_y - stem_h - 6.5)} "
                f"Q {point(cx + 3, peak_y - stem_h - 4)} {point(cx + 2.2, peak_y - stem_h)} Z",
                fill=stroke,
                stroke="none",
            ),
        ])
    return ""


def render_dormer(
    cx: float,
    roof_y: float,
    width: float,
    height: float,
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Small triangular dormer window protruding above roof line."""
    left = cx - width / 2
    right = cx + width / 2
    base = roof_y + 1
    peak = roof_y - height
    pts = [(left, base), (cx, peak), (right, base)]
    return polygon(pts, fill=fill, stroke=stroke, stroke_width=stroke_width * 0.8)


# ---------------------------------------------------------------------------
# Facade renderers — each returns an SVG <g> element
# ---------------------------------------------------------------------------


def _chimneys_on_body(
    spec: dict[str, object],
    x: float,
    width: float,
    height: float,
    chimney_base_y: float,
    fill: str,
    stroke: str,
    stroke_width: float,
) -> list[str]:
    """Render chimneys that sit on a flat body top."""
    parts: list[str] = []
    for cs in spec.get("chimneys", []):
        cx_ratio = float(cs["x"])
        cw = width * float(cs.get("width", 0.08))
        ch = height * float(cs.get("height", 0.14))
        cl = x + (width * cx_ratio) - (cw / 2)
        parts.append(render_chimney(cl, chimney_base_y, cw, ch, fill, stroke, stroke_width))
    return parts


def _chimneys_on_slope(
    spec: dict[str, object],
    x: float,
    width: float,
    height: float,
    left_y: float,
    peak_y: float,
    right_y: float | None,
    fill: str,
    stroke: str,
    stroke_width: float,
) -> list[str]:
    """Render chimneys sitting on a sloped or V-shaped roof."""
    if right_y is None:
        right_y = left_y
    parts: list[str] = []
    for cs in spec.get("chimneys", []):
        cx_ratio = float(cs["x"])
        cw = width * float(cs.get("width", 0.078))
        ch = height * float(cs.get("height", 0.14))
        cl = x + (width * cx_ratio) - (cw / 2)
        if cx_ratio < 0.5:
            t = cx_ratio / 0.5
            chimney_bottom = left_y + (peak_y - left_y) * t + (height * 0.03)
        else:
            t = (cx_ratio - 0.5) / 0.5
            chimney_bottom = peak_y + (right_y - peak_y) * t + (height * 0.03)
        parts.append(render_chimney(cl, chimney_bottom, cw, ch, fill, stroke, stroke_width))
    return parts


def _optional_hoist(
    spec: dict[str, object],
    center_x: float,
    peak_y: float,
    stroke: str,
    stroke_width: float,
) -> list[str]:
    if spec.get("hoist"):
        return [render_hoist(center_x, peak_y + 1.4, stroke, stroke_width)]
    return []


def _optional_finial(
    spec: dict[str, object],
    center_x: float,
    peak_y: float,
    stroke: str,
    stroke_width: float,
) -> list[str]:
    style = spec.get("finial")
    if style:
        return [render_finial(center_x, peak_y, stroke, stroke_width, str(style))]
    return []


def render_stepped_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    width = float(spec["width"])
    height = float(spec["height"])
    body_ratio = float(spec.get("body_ratio", 0.72))
    steps = int(spec.get("steps", 5))
    top_width_ratio = float(spec.get("top_width_ratio", 0.18))
    body_top = base_y - (height * body_ratio)
    peak_y = base_y - height
    neck_y = peak_y + (height * 0.08)
    peak_left_x = x + ((width - (width * top_width_ratio)) / 2)
    step_width = (peak_left_x - x) / steps
    step_height = (body_top - neck_y) / steps

    left_points = [(x, base_y), (x, body_top)]
    for index in range(steps):
        inset = x + (step_width * (index + 1))
        step_top = body_top - (step_height * index)
        step_next = body_top - (step_height * (index + 1))
        left_points.append((inset, step_top))
        left_points.append((inset, step_next))

    center_x = x + (width / 2)
    right_points = mirror_points(left_points[1:], x, width)
    silhouette = left_points + [(center_x, peak_y)] + right_points + [(x + width, base_y)]
    parts = [polygon(silhouette)]

    parts.extend(_chimneys_on_body(spec, x, width, height, body_top + 2, fill, stroke, stroke_width))
    parts.extend(_optional_hoist(spec, center_x, peak_y, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_bell_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Klokgevel — bell gable with S-curved profile."""
    width = float(spec["width"])
    height = float(spec["height"])
    body_ratio = float(spec.get("body_ratio", 0.63))
    neck_width_ratio = float(spec.get("neck_width_ratio", 0.23))
    shoulder_inset_ratio = float(spec.get("shoulder_inset_ratio", 0.2))
    body_top = base_y - (height * body_ratio)
    neck_y = base_y - (height * 0.87)
    peak_y = base_y - height
    center_x = x + (width / 2)
    neck_width = width * neck_width_ratio
    shoulder_inset = width * shoulder_inset_ratio
    upper_neck_y = peak_y + (height * 0.12)

    d = " ".join(
        [
            f"M {point(x, base_y)}",
            f"L {point(x, body_top)}",
            # Left bell curve from body top to neck
            (
                f"C {point(x, body_top - (height * 0.07))} "
                f"{point(x + (shoulder_inset * 0.38), neck_y + (height * 0.11))} "
                f"{point(center_x - (neck_width / 2), neck_y)}"
            ),
            f"L {point(center_x - (neck_width / 2), upper_neck_y)}",
            f"L {point(center_x, peak_y)}",
            f"L {point(center_x + (neck_width / 2), upper_neck_y)}",
            f"L {point(center_x + (neck_width / 2), neck_y)}",
            # Right bell curve from neck to body top
            (
                f"C {point(x + width - (shoulder_inset * 0.38), neck_y + (height * 0.11))} "
                f"{point(x + width, body_top - (height * 0.07))} "
                f"{point(x + width, body_top)}"
            ),
            f"L {point(x + width, base_y)}",
            "Z",
        ]
    )

    parts = [path(d)]
    parts.extend(_chimneys_on_body(spec, x, width, height, body_top + 2, fill, stroke, stroke_width))
    parts.extend(_optional_hoist(spec, center_x, peak_y, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_neck_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Halsgevel — neck gable with distinct narrow neck rising from shoulders."""
    width = float(spec["width"])
    height = float(spec["height"])
    body_ratio = float(spec.get("body_ratio", 0.66))
    shoulder_inset_ratio = float(spec.get("shoulder_inset_ratio", 0.18))
    neck_width_ratio = float(spec.get("neck_width_ratio", 0.24))
    body_top = base_y - (height * body_ratio)
    shoulder_y = base_y - (height * 0.81)
    neck_y = base_y - (height * 0.9)
    peak_y = base_y - height
    center_x = x + (width / 2)
    shoulder_inset = width * shoulder_inset_ratio
    neck_width = width * neck_width_ratio
    upper_neck_y = peak_y + (height * 0.10)

    left_points = [
        (x, base_y),
        (x, body_top),
        (x + shoulder_inset, shoulder_y),
        (center_x - (neck_width / 2), neck_y),
        (center_x - (neck_width / 2), upper_neck_y),
    ]
    right_points = mirror_points(left_points[1:], x, width)
    silhouette = left_points + [(center_x, peak_y)] + right_points + [(x + width, base_y)]
    parts = [polygon(silhouette)]

    for chimney_spec in spec.get("chimneys", []):
        chimney_x = float(chimney_spec["x"])
        chimney_width = width * float(chimney_spec.get("width", 0.075))
        chimney_height = height * float(chimney_spec.get("height", 0.14))
        chimney_left = x + (width * chimney_x) - (chimney_width / 2)
        chimney_bottom = body_top + 2
        parts.append(render_chimney(chimney_left, chimney_bottom, chimney_width, chimney_height, fill, stroke, stroke_width))

    parts.extend(_optional_hoist(spec, center_x, peak_y, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_spout_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Tuitgevel — spout gable, clean triangular top."""
    width = float(spec["width"])
    height = float(spec["height"])
    body_ratio = float(spec.get("body_ratio", 0.73))
    shoulder_inset_ratio = float(spec.get("shoulder_inset_ratio", 0.2))
    body_top = base_y - (height * body_ratio)
    pediment_y = base_y - (height * 0.87)
    peak_y = base_y - height
    center_x = x + (width / 2)
    shoulder_inset = width * shoulder_inset_ratio

    silhouette = [
        (x, base_y),
        (x, body_top),
        (x + shoulder_inset, pediment_y),
        (center_x, peak_y),
        (x + width - shoulder_inset, pediment_y),
        (x + width, body_top),
        (x + width, base_y),
    ]

    parts = [polygon(silhouette)]
    parts.extend(_chimneys_on_body(spec, x, width, height, body_top + 2, fill, stroke, stroke_width))
    parts.extend(_optional_hoist(spec, center_x, peak_y, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_warehouse_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Pakhuis — warehouse with broad triangular gable."""
    width = float(spec["width"])
    height = float(spec["height"])
    body_ratio = float(spec.get("body_ratio", 0.67))
    body_top = base_y - (height * body_ratio)
    peak_y = base_y - height
    center_x = x + (width / 2)

    silhouette = [
        (x, base_y),
        (x, body_top),
        (center_x, peak_y),
        (x + width, body_top),
        (x + width, base_y),
    ]

    parts = [polygon(silhouette)]
    parts.extend(_chimneys_on_slope(spec, x, width, height, body_top, peak_y, body_top, fill, stroke, stroke_width))
    parts.extend(_optional_hoist(spec, center_x, peak_y, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_hip_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Hip roof with flat ridge, optional dormer."""
    width = float(spec["width"])
    height = float(spec["height"])
    eave_ratio = float(spec.get("eave_ratio", 0.62))
    ridge_ratio = float(spec.get("ridge_ratio", 0.26))
    eave_y = base_y - (height * eave_ratio)
    ridge_y = base_y - (height * 0.93)
    ridge_width = width * ridge_ratio
    center_x = x + (width / 2)

    silhouette = [
        (x, base_y),
        (x, eave_y),
        (center_x - (ridge_width / 2), ridge_y),
        (center_x + (ridge_width / 2), ridge_y),
        (x + width, eave_y),
        (x + width, base_y),
    ]

    parts = [polygon(silhouette)]

    for chimney_spec in spec.get("chimneys", []):
        chimney_x_ratio = float(chimney_spec["x"])
        cw = width * float(chimney_spec.get("width", 0.082))
        ch = height * float(chimney_spec.get("height", 0.16))
        cl = x + (width * chimney_x_ratio) - (cw / 2)
        span = 0.5 - (ridge_ratio / 2)
        slope_progress = min(1.0, abs(chimney_x_ratio - 0.5) / span)
        chimney_bottom = ridge_y + ((eave_y - ridge_y) * slope_progress) + (height * 0.04)
        parts.append(render_chimney(cl, chimney_bottom, cw, ch, fill, stroke, stroke_width))

    # Optional dormer
    if spec.get("dormer"):
        dormer_cx = center_x + float(spec.get("dormer_offset", 0))
        dormer_w = width * 0.22
        dormer_h = height * 0.07
        slope_mid = (eave_y + ridge_y) / 2
        parts.append(render_dormer(dormer_cx, slope_mid, dormer_w, dormer_h, fill, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_mansard_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Mansard roof — steep lower slope, gentle upper slope, optional dormer."""
    width = float(spec["width"])
    height = float(spec["height"])
    eave_y = base_y - (height * float(spec.get("eave_ratio", 0.58)))
    break_y = base_y - (height * float(spec.get("break_ratio", 0.79)))
    top_y = base_y - (height * 0.93)
    ridge_width = width * float(spec.get("ridge_ratio", 0.34))
    center_x = x + (width / 2)
    shoulder_inset = width * 0.14

    silhouette = [
        (x, base_y),
        (x, eave_y),
        (x + shoulder_inset, break_y),
        (center_x - (ridge_width / 2), top_y),
        (center_x + (ridge_width / 2), top_y),
        (x + width - shoulder_inset, break_y),
        (x + width, eave_y),
        (x + width, base_y),
    ]

    parts = [polygon(silhouette)]

    for chimney_spec in spec.get("chimneys", []):
        chimney_x_ratio = float(chimney_spec["x"])
        cw = width * float(chimney_spec.get("width", 0.08))
        ch = height * float(chimney_spec.get("height", 0.16))
        cl = x + (width * chimney_x_ratio) - (cw / 2)
        inner_left = 0.5 - (ridge_width / (2 * width))
        inner_right = 0.5 + (ridge_width / (2 * width))
        if inner_left <= chimney_x_ratio <= inner_right:
            chimney_bottom = top_y + (height * 0.05)
        elif chimney_x_ratio < 0.5:
            progress = max(0.0, chimney_x_ratio / inner_left)
            chimney_bottom = break_y + ((top_y - break_y) * progress) + (height * 0.08)
        else:
            progress = max(0.0, (1.0 - chimney_x_ratio) / (1.0 - inner_right))
            chimney_bottom = break_y + ((top_y - break_y) * progress) + (height * 0.08)
        parts.append(render_chimney(cl, chimney_bottom, cw, ch, fill, stroke, stroke_width))

    # Optional dormer on steep lower slope
    if spec.get("dormer"):
        dormer_cx = center_x + float(spec.get("dormer_offset", 0))
        dormer_w = width * 0.2
        dormer_h = height * 0.065
        slope_mid = (eave_y + break_y) / 2
        parts.append(render_dormer(dormer_cx, slope_mid, dormer_w, dormer_h, fill, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_cornice_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Lijstgevel — cornice gable, flat top with ornamental cornice and optional central pediment."""
    width = float(spec["width"])
    height = float(spec["height"])
    cornice_h = max(2.5, height * 0.025)
    cornice_overhang = max(1.5, width * 0.04)
    body_top = base_y - height + cornice_h
    center_x = x + (width / 2)

    pediment_ratio = float(spec.get("pediment_ratio", 0.0))
    if pediment_ratio > 0:
        # Central triangular pediment
        ped_width = width * pediment_ratio
        ped_height = max(4, height * 0.05)
        ped_y = body_top - cornice_h - ped_height

        silhouette = [
            (x, base_y),
            (x, body_top),
            # Cornice left
            (x - cornice_overhang, body_top),
            (x - cornice_overhang, body_top - cornice_h),
            # Flat top to pediment
            (center_x - ped_width / 2, body_top - cornice_h),
            # Pediment triangle
            (center_x, ped_y),
            (center_x + ped_width / 2, body_top - cornice_h),
            # Flat top to right cornice
            (x + width + cornice_overhang, body_top - cornice_h),
            (x + width + cornice_overhang, body_top),
            (x + width, body_top),
            (x + width, base_y),
        ]
    else:
        # Plain flat top with cornice only
        silhouette = [
            (x, base_y),
            (x, body_top),
            (x - cornice_overhang, body_top),
            (x - cornice_overhang, body_top - cornice_h),
            (x + width + cornice_overhang, body_top - cornice_h),
            (x + width + cornice_overhang, body_top),
            (x + width, body_top),
            (x + width, base_y),
        ]

    peak_y = ped_y if pediment_ratio > 0 else body_top - cornice_h
    parts = [polygon(silhouette)]
    parts.extend(_chimneys_on_body(spec, x, width, height, body_top + 2, fill, stroke, stroke_width))
    parts.extend(_optional_finial(spec, center_x, peak_y, stroke, stroke_width))

    return element("g", "\n".join(parts))


def render_church_tower(
    x: float,
    base_y: float,
    width: float,
    height: float,
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    """Dutch church tower with stepped profile and spire."""
    base_h = height * 0.52
    mid_h = height * 0.22
    upper_h = height * 0.11
    spire_h = height * 0.15

    base_top = base_y - base_h
    mid_width = width * 0.72
    mid_top = base_top - mid_h
    upper_width = mid_width * 0.68
    upper_top = mid_top - upper_h
    center = x + width / 2

    silhouette = [
        (x, base_y),
        (x, base_top),
        (center - mid_width / 2, base_top),
        (center - mid_width / 2, mid_top),
        (center - upper_width / 2, mid_top),
        (center - upper_width / 2, upper_top),
        (center, base_y - height),
        (center + upper_width / 2, upper_top),
        (center + upper_width / 2, mid_top),
        (center + mid_width / 2, mid_top),
        (center + mid_width / 2, base_top),
        (x + width, base_top),
        (x + width, base_y),
    ]

    return polygon(silhouette, fill=fill, stroke=stroke, stroke_width=stroke_width, stroke_linejoin="miter")


# ---------------------------------------------------------------------------
# Facade dispatch + layer renderer
# ---------------------------------------------------------------------------


def render_facade(
    x: float,
    base_y: float,
    spec: dict[str, object],
    fill: str,
    stroke: str,
    stroke_width: float,
) -> str:
    kind = str(spec["kind"])
    builders = {
        "stepped": render_stepped_facade,
        "bell": render_bell_facade,
        "neck": render_neck_facade,
        "spout": render_spout_facade,
        "warehouse": render_warehouse_facade,
        "hip": render_hip_facade,
        "mansard": render_mansard_facade,
        "cornice": render_cornice_facade,
    }
    return builders[kind](x, base_y, spec, fill, stroke, stroke_width)


def render_layer(
    specs: list[dict[str, object]],
    *,
    fill: str,
    stroke: str,
    stroke_width: float,
    opacity: float,
    start_x: float,
    span: float,
) -> str:
    scale = span / sum(float(spec["width"]) for spec in specs)
    x = start_x
    parts = []
    for raw_spec in specs:
        spec = scale_spec(raw_spec, scale)
        parts.append(render_facade(x, GROUND_Y, spec, fill, stroke, stroke_width))
        x += float(spec["width"])

    return element(
        "g",
        "\n".join(parts),
        fill=fill,
        stroke=stroke,
        stroke_width=stroke_width,
        stroke_linejoin="miter",
        stroke_linecap="square",
        stroke_miterlimit=2,
        opacity=opacity,
    )


# ---------------------------------------------------------------------------
# Building spec data — each building is unique in shape, proportions, and trim
# ---------------------------------------------------------------------------


FAR_LAYER_SPECS: list[dict[str, object]] = [
    {"kind": "cornice", "width": 30, "height": 112, "pediment_ratio": 0.4, "chimneys": [chimney(0.78, 0.09, 0.15)], "finial": "spike"},
    {"kind": "bell", "width": 32, "height": 124, "neck_width_ratio": 0.21, "shoulder_inset_ratio": 0.24, "chimneys": [chimney(0.24, 0.08, 0.13)], "hoist": True, "finial": "ball"},
    {"kind": "stepped", "width": 28, "height": 118, "steps": 5, "top_width_ratio": 0.17, "chimneys": [chimney(0.73, 0.075, 0.14)]},
    {"kind": "neck", "width": 31, "height": 121, "neck_width_ratio": 0.22, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.22, 0.07, 0.13)], "hoist": True, "finial": "vase"},
    {"kind": "spout", "width": 33, "height": 115, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.68, 0.08, 0.14)], "finial": "ball"},
    {"kind": "cornice", "width": 36, "height": 108, "pediment_ratio": 0.0, "chimneys": [chimney(0.26, 0.085, 0.15), chimney(0.76, 0.075, 0.13)]},
    {"kind": "bell", "width": 30, "height": 126, "neck_width_ratio": 0.19, "shoulder_inset_ratio": 0.22, "chimneys": [chimney(0.72, 0.075, 0.14)], "finial": "spike"},
    {"kind": "warehouse", "width": 38, "height": 110, "chimneys": [chimney(0.24, 0.07, 0.15)], "hoist": True},
    {"kind": "stepped", "width": 29, "height": 122, "steps": 6, "top_width_ratio": 0.15, "chimneys": [chimney(0.28, 0.075, 0.13)], "finial": "ball"},
    {"kind": "neck", "width": 30, "height": 120, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.17, "chimneys": [chimney(0.76, 0.07, 0.12), chimney(0.24, 0.07, 0.14)], "finial": "ball"},
    {"kind": "mansard", "width": 35, "height": 114, "eave_ratio": 0.56, "break_ratio": 0.78, "ridge_ratio": 0.36, "chimneys": [chimney(0.7, 0.08, 0.16)], "dormer": True},
    {"kind": "bell", "width": 31, "height": 128, "neck_width_ratio": 0.24, "shoulder_inset_ratio": 0.2, "chimneys": [chimney(0.28, 0.08, 0.14)], "hoist": True, "finial": "vase"},
    {"kind": "spout", "width": 32, "height": 116, "shoulder_inset_ratio": 0.22, "chimneys": [chimney(0.23, 0.078, 0.13)], "hoist": True},
    {"kind": "cornice", "width": 34, "height": 111, "pediment_ratio": 0.35, "chimneys": [chimney(0.74, 0.085, 0.14)], "finial": "ball"},
    {"kind": "hip", "width": 36, "height": 113, "eave_ratio": 0.6, "ridge_ratio": 0.28, "chimneys": [chimney(0.3, 0.08, 0.16)], "dormer": True, "dormer_offset": -3},
    {"kind": "neck", "width": 29, "height": 125, "neck_width_ratio": 0.21, "shoulder_inset_ratio": 0.18, "chimneys": [chimney(0.73, 0.07, 0.13)], "finial": "spike"},
    {"kind": "stepped", "width": 31, "height": 119, "steps": 4, "top_width_ratio": 0.2, "chimneys": [chimney(0.7, 0.075, 0.14)], "finial": "ball"},
    {"kind": "bell", "width": 33, "height": 123, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.25, "chimneys": [chimney(0.71, 0.078, 0.15)], "finial": "ball"},
    {"kind": "warehouse", "width": 40, "height": 107, "chimneys": [chimney(0.76, 0.072, 0.15)], "hoist": True},
    {"kind": "spout", "width": 30, "height": 118, "shoulder_inset_ratio": 0.18, "chimneys": [chimney(0.72, 0.08, 0.14)], "finial": "spike"},
    {"kind": "cornice", "width": 33, "height": 113, "pediment_ratio": 0.38, "chimneys": [chimney(0.25, 0.08, 0.14)], "finial": "vase"},
    {"kind": "neck", "width": 30, "height": 127, "neck_width_ratio": 0.23, "shoulder_inset_ratio": 0.2, "chimneys": [chimney(0.26, 0.072, 0.13)], "hoist": True, "finial": "ball"},
    {"kind": "bell", "width": 31, "height": 121, "neck_width_ratio": 0.22, "shoulder_inset_ratio": 0.21, "chimneys": [chimney(0.27, 0.08, 0.15)], "finial": "spike"},
    {"kind": "stepped", "width": 29, "height": 120, "steps": 7, "top_width_ratio": 0.14, "chimneys": [chimney(0.26, 0.075, 0.13)]},
    {"kind": "hip", "width": 34, "height": 109, "eave_ratio": 0.64, "ridge_ratio": 0.3, "chimneys": [chimney(0.72, 0.082, 0.16)]},
]


MID_LAYER_SPECS: list[dict[str, object]] = [
    {"kind": "neck", "width": 36, "height": 138, "neck_width_ratio": 0.21, "shoulder_inset_ratio": 0.17, "chimneys": [chimney(0.23, 0.075, 0.14)], "hoist": True, "finial": "ball"},
    {"kind": "bell", "width": 38, "height": 134, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.23, "chimneys": [chimney(0.72, 0.078, 0.15)], "hoist": True, "finial": "vase"},
    {"kind": "cornice", "width": 40, "height": 126, "pediment_ratio": 0.38, "chimneys": [chimney(0.26, 0.082, 0.15)], "finial": "spike"},
    {"kind": "stepped", "width": 37, "height": 142, "steps": 5, "top_width_ratio": 0.18, "chimneys": [chimney(0.7, 0.075, 0.14)], "finial": "ball"},
    {"kind": "spout", "width": 38, "height": 137, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.24, 0.08, 0.14)], "hoist": True, "finial": "ball"},
    {"kind": "bell", "width": 39, "height": 131, "neck_width_ratio": 0.24, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.28, 0.078, 0.15), chimney(0.74, 0.072, 0.12)], "finial": "spike"},
    {"kind": "warehouse", "width": 44, "height": 125, "chimneys": [chimney(0.22, 0.075, 0.16)], "hoist": True},
    {"kind": "cornice", "width": 38, "height": 129, "pediment_ratio": 0.42, "chimneys": [chimney(0.75, 0.08, 0.14)], "finial": "ball"},
    {"kind": "neck", "width": 37, "height": 140, "neck_width_ratio": 0.19, "shoulder_inset_ratio": 0.2, "chimneys": [chimney(0.76, 0.072, 0.13)], "finial": "vase"},
    {"kind": "mansard", "width": 42, "height": 128, "eave_ratio": 0.55, "break_ratio": 0.77, "ridge_ratio": 0.32, "chimneys": [chimney(0.27, 0.08, 0.16)], "dormer": True, "dormer_offset": 4},
    {"kind": "stepped", "width": 36, "height": 143, "steps": 6, "top_width_ratio": 0.16, "chimneys": [chimney(0.25, 0.075, 0.14)]},
    {"kind": "bell", "width": 37, "height": 135, "neck_width_ratio": 0.22, "shoulder_inset_ratio": 0.22, "chimneys": [chimney(0.71, 0.078, 0.15)], "hoist": True, "finial": "ball"},
    {"kind": "spout", "width": 39, "height": 136, "shoulder_inset_ratio": 0.21, "chimneys": [chimney(0.67, 0.075, 0.14)], "finial": "spike"},
    {"kind": "hip", "width": 42, "height": 124, "eave_ratio": 0.58, "ridge_ratio": 0.24, "chimneys": [chimney(0.3, 0.082, 0.17)], "dormer": True, "dormer_offset": -4},
    {"kind": "neck", "width": 36, "height": 139, "neck_width_ratio": 0.23, "shoulder_inset_ratio": 0.18, "chimneys": [chimney(0.24, 0.072, 0.14), chimney(0.76, 0.072, 0.12)], "hoist": True, "finial": "ball"},
    {"kind": "cornice", "width": 39, "height": 127, "pediment_ratio": 0.0, "chimneys": [chimney(0.73, 0.085, 0.14), chimney(0.27, 0.08, 0.15)]},
    {"kind": "bell", "width": 38, "height": 133, "neck_width_ratio": 0.21, "shoulder_inset_ratio": 0.24, "chimneys": [chimney(0.26, 0.078, 0.15)], "finial": "vase"},
    {"kind": "stepped", "width": 35, "height": 144, "steps": 5, "top_width_ratio": 0.19, "chimneys": [chimney(0.68, 0.075, 0.14)], "finial": "spike"},
    {"kind": "warehouse", "width": 45, "height": 122, "chimneys": [chimney(0.76, 0.075, 0.15)], "hoist": True},
    {"kind": "neck", "width": 37, "height": 137, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.74, 0.07, 0.13)], "finial": "ball"},
    {"kind": "spout", "width": 38, "height": 135, "shoulder_inset_ratio": 0.2, "chimneys": [chimney(0.25, 0.08, 0.14)], "hoist": True},
    {"kind": "bell", "width": 39, "height": 132, "neck_width_ratio": 0.19, "shoulder_inset_ratio": 0.25, "chimneys": [chimney(0.73, 0.078, 0.14)], "hoist": True, "finial": "ball"},
]


FOREGROUND_SPECS: list[dict[str, object]] = [
    {"kind": "bell", "width": 42, "height": 175, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.24, "chimneys": [chimney(0.74, 0.08, 0.16)], "hoist": True, "finial": "ball"},
    {"kind": "stepped", "width": 46, "height": 182, "steps": 6, "top_width_ratio": 0.15, "chimneys": [chimney(0.23, 0.078, 0.15)], "finial": "spike"},
    {"kind": "cornice", "width": 44, "height": 158, "pediment_ratio": 0.4, "chimneys": [chimney(0.76, 0.085, 0.15), chimney(0.24, 0.08, 0.14)], "finial": "ball"},
    {"kind": "neck", "width": 43, "height": 172, "neck_width_ratio": 0.19, "shoulder_inset_ratio": 0.17, "chimneys": [chimney(0.2, 0.075, 0.14)], "hoist": True, "finial": "vase"},
    {"kind": "spout", "width": 45, "height": 178, "shoulder_inset_ratio": 0.18, "chimneys": [chimney(0.71, 0.08, 0.14)], "hoist": True, "finial": "ball"},
    {"kind": "bell", "width": 44, "height": 168, "neck_width_ratio": 0.25, "shoulder_inset_ratio": 0.19, "chimneys": [chimney(0.27, 0.08, 0.16), chimney(0.73, 0.075, 0.13)], "finial": "spike"},
    {"kind": "warehouse", "width": 52, "height": 155, "chimneys": [chimney(0.78, 0.075, 0.16)], "hoist": True},
    {"kind": "neck", "width": 44, "height": 170, "neck_width_ratio": 0.22, "shoulder_inset_ratio": 0.16, "chimneys": [chimney(0.22, 0.072, 0.14), chimney(0.78, 0.072, 0.12)], "hoist": True, "finial": "ball"},
    {"kind": "cornice", "width": 46, "height": 156, "pediment_ratio": 0.36, "chimneys": [chimney(0.26, 0.085, 0.15)], "finial": "vase"},
    {"kind": "stepped", "width": 48, "height": 185, "steps": 7, "top_width_ratio": 0.14, "chimneys": [chimney(0.68, 0.075, 0.14)], "finial": "ball"},
    {"kind": "mansard", "width": 50, "height": 160, "eave_ratio": 0.54, "break_ratio": 0.76, "ridge_ratio": 0.3, "chimneys": [chimney(0.72, 0.08, 0.17)], "dormer": True, "dormer_offset": -5},
    {"kind": "bell", "width": 43, "height": 173, "neck_width_ratio": 0.21, "shoulder_inset_ratio": 0.23, "chimneys": [chimney(0.73, 0.078, 0.15)], "hoist": True, "finial": "vase"},
    {"kind": "spout", "width": 45, "height": 176, "shoulder_inset_ratio": 0.21, "chimneys": [chimney(0.25, 0.08, 0.14)], "finial": "spike"},
    {"kind": "hip", "width": 48, "height": 152, "eave_ratio": 0.6, "ridge_ratio": 0.22, "chimneys": [chimney(0.3, 0.082, 0.17)], "dormer": True, "dormer_offset": 5},
    {"kind": "neck", "width": 42, "height": 174, "neck_width_ratio": 0.2, "shoulder_inset_ratio": 0.18, "chimneys": [chimney(0.76, 0.072, 0.13)], "hoist": True, "finial": "ball"},
    {"kind": "cornice", "width": 47, "height": 154, "pediment_ratio": 0.0, "chimneys": [chimney(0.74, 0.085, 0.15), chimney(0.26, 0.08, 0.14)]},
    {"kind": "stepped", "width": 44, "height": 180, "steps": 5, "top_width_ratio": 0.19, "chimneys": [chimney(0.28, 0.075, 0.14)], "finial": "ball"},
    {"kind": "bell", "width": 41, "height": 171, "neck_width_ratio": 0.23, "shoulder_inset_ratio": 0.2, "chimneys": [chimney(0.26, 0.08, 0.15)], "finial": "ball"},
    {"kind": "warehouse", "width": 54, "height": 153, "chimneys": [chimney(0.23, 0.075, 0.15)], "hoist": True},
    {"kind": "neck", "width": 43, "height": 169, "neck_width_ratio": 0.24, "shoulder_inset_ratio": 0.17, "chimneys": [chimney(0.21, 0.072, 0.14)], "hoist": True, "finial": "spike"},
]


# ---------------------------------------------------------------------------
# SVG assembly
# ---------------------------------------------------------------------------


def build_svg() -> str:
    far_layer = render_layer(
        FAR_LAYER_SPECS,
        fill="#172837",
        stroke="#22384A",
        stroke_width=1.05,
        opacity=0.86,
        start_x=-20,
        span=1068,
    )
    mid_layer = render_layer(
        MID_LAYER_SPECS,
        fill="#22384A",
        stroke="#2F4A60",
        stroke_width=1.15,
        opacity=0.94,
        start_x=-14,
        span=1056,
    )
    foreground_layer = render_layer(
        FOREGROUND_SPECS,
        fill="#314C65",
        stroke="#46657E",
        stroke_width=1.35,
        opacity=1,
        start_x=-12,
        span=1052,
    )

    # Church tower in far background
    church = render_church_tower(
        x=738, base_y=GROUND_Y, width=24, height=210,
        fill="#172837", stroke="#22384A", stroke_width=1.05,
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_WIDTH}" height="{SVG_HEIGHT}" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F1923"/>
      <stop offset="100%" stop-color="#162536"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="35%">
      <stop offset="0%" stop-color="#2EC4B6" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#2EC4B6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8BA4BF" stop-opacity="0"/>
      <stop offset="100%" stop-color="#8BA4BF" stop-opacity="0.08"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="500" fill="url(#sky)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <rect x="0" y="298" width="1024" height="202" fill="url(#haze)"/>

  <g fill="#FFF" opacity="0.15">
    <circle cx="72" cy="48" r="1"/><circle cx="168" cy="28" r="1.2"/>
    <circle cx="255" cy="62" r="0.8"/><circle cx="350" cy="38" r="1.1"/>
    <circle cx="440" cy="70" r="0.7"/><circle cx="530" cy="30" r="1.2"/>
    <circle cx="615" cy="52" r="0.9"/><circle cx="708" cy="36" r="1"/>
    <circle cx="795" cy="58" r="1.2"/><circle cx="888" cy="40" r="0.8"/>
    <circle cx="965" cy="68" r="1"/><circle cx="135" cy="85" r="0.6"/>
    <circle cx="385" cy="90" r="0.7"/><circle cx="670" cy="78" r="0.8"/>
    <circle cx="840" cy="82" r="0.6"/><circle cx="500" cy="45" r="0.9"/>
  </g>

  <g opacity="0.86">
    {church}
  </g>

  {far_layer}
  {mid_layer}
  {foreground_layer}

  <rect x="0" y="497" width="1024" height="3" fill="#2EC4B6" opacity="0.3"/>

  <g transform="translate(467, 118) scale(0.8)">
    <path d="M80,52 L80,80 L20,80 L20,20 L38,5 L64,20 L80,30"
          stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round" stroke-linecap="butt" fill="none"/>
    <path d="M29.5 54 C31 56, 34 68, 42 78 C48 85, 53 84, 58 78 C65 68, 80 40, 94 18 C95 16, 96 15, 95 14 C93 13, 91 14, 88 18 C78 35, 58 64, 52 70 C47 75, 45 74, 40 68 C34 58, 31 52, 28 50 C26.5 49, 28 52, 29.5 54 Z" fill="#2EC4B6"/>
  </g>

  <g transform="translate(363, 170) scale(1.4)">
    <path fill="#FFFFFF" d="M2.92 50L13.57 50C19.01 50 22.14 47.37 22.14 42.87C22.14 39.81 20.74 37.72 17.96 36.82C20.45 35.78 21.74 33.69 21.74 30.78C21.74 26.38 18.58 23.68 13.39 23.68L2.92 23.68ZM13 27.75C15.59 27.75 17.03 28.98 17.03 31.24C17.03 33.58 15.62 34.92 13.1 34.92L7.52 34.92L7.52 27.75ZM13.39 38.8C15.95 38.8 17.42 40.06 17.42 42.3C17.42 44.67 15.98 45.93 13.39 45.93L7.52 45.93L7.52 38.8ZM37.76 32.22L37.76 41.54C37.76 44.92 36.43 46.54 33.66 46.54C31.21 46.54 29.88 45.18 29.88 41.79L29.88 32.22L25.49 32.22L25.49 43.34C25.49 47.7 27.9 50.47 32 50.47C34.38 50.47 36.68 49.32 37.76 47.62L38.09 50L42.16 50L42.16 32.22ZM58.75 32.22L58.75 41.54C58.75 44.92 57.42 46.54 54.65 46.54C52.2 46.54 50.87 45.18 50.87 41.79L50.87 32.22L46.48 32.22L46.48 43.34C46.48 47.7 48.89 50.47 52.99 50.47C55.37 50.47 57.67 49.32 58.75 47.62L59.08 50L63.14 50L63.14 32.22ZM78.84 32.14C78.12 31.96 77.51 31.89 76.9 31.89C74.52 31.89 72.83 33.08 72.07 34.84L71.82 32.25L67.68 32.25L67.68 50L72.07 50L72.07 41.36C72.07 37.9 74.05 36.21 77.22 36.21L78.84 36.21ZM88.6 50L88.6 35.89L92.05 35.89L92.05 32.22L88.6 32.22L88.6 26.67L84.2 26.67L84.2 32.22L80.78 32.22L80.78 35.89L84.2 35.89L84.2 50ZM116.28 50.43C122.51 50.43 127.33 46.76 128.34 41.22L123.55 41.22C122.69 44.13 119.95 46 116.39 46C111.56 46 108.47 42.4 108.47 36.82C108.47 31.21 111.53 27.68 116.39 27.68C119.88 27.68 122.51 29.48 123.41 32.54L128.27 32.54C127.37 26.89 122.72 23.25 116.5 23.25C108.79 23.25 103.64 28.69 103.64 36.86C103.64 45.1 108.61 50.43 116.28 50.43ZM136.04 50L136.04 40.28C136.04 37.62 137.66 35.67 140.44 35.67C142.67 35.67 144.14 37.11 144.14 40.1L144.14 50L148.54 50L148.54 39.06C148.54 34.45 146.23 31.68 141.84 31.68C139.28 31.68 137.2 32.79 136.08 34.52L136.08 23.22L131.65 23.22L131.65 50ZM160.81 50.47C165.46 50.47 168.7 48.13 169.45 44.24L165.38 44.24C164.88 45.93 163.3 46.87 160.88 46.87C157.97 46.87 156.31 45.28 155.99 42.15L169.38 42.12L169.38 40.78C169.38 35.24 166 31.68 160.67 31.68C155.45 31.68 151.81 35.53 151.81 41.11C151.81 46.62 155.52 50.47 160.81 50.47ZM160.7 35.28C163.33 35.28 165.02 36.9 165.02 39.34L156.1 39.34C156.53 36.68 158.11 35.28 160.7 35.28ZM171.86 41.07C171.86 46.72 175.39 50.47 180.79 50.47C185.44 50.47 188.89 47.62 189.43 43.48L185 43.48C184.54 45.43 182.99 46.51 180.79 46.51C177.98 46.51 176.26 44.42 176.26 41.07C176.26 37.72 178.13 35.6 180.94 35.6C183.02 35.6 184.5 36.64 185 38.66L189.4 38.66C188.93 34.38 185.62 31.68 180.76 31.68C175.5 31.68 171.86 35.56 171.86 41.07ZM197.14 50L197.14 45.21L199.73 42.51L204.37 50L209.41 50L202.79 39.27L209.56 32.22L204.05 32.22L197.14 39.67L197.14 23.22L192.78 23.22L192.78 50Z"/>
  </g>

  <text x="512" y="266" text-anchor="middle"
        font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-weight="400" font-size="15" fill="#637892" letter-spacing="2.5">
    Je huis onder de duim
  </text>
</svg>
"""


def main() -> None:
    OUTPUT_PATH.write_text(build_svg(), encoding="utf-8")


if __name__ == "__main__":
    main()
