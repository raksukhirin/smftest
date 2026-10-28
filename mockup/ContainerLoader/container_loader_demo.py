#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Container Loader Demo
(Mix-Height-In-Layer + Special Constraints + PDF Diagram)
--------------------------------------------------------
Features:
- Mix-height-in-layer packing for Non-DG AND for each DG class (segregated by class).
- Constraints per item:
  * NoWall (keeps clearance from walls in mm)
  * NearDoor (must be inside door zone near FRONT/BACK)
  * DG_Class (hazmat segregation; no mixing with non-DG or other DG classes)
- PDF includes a Container Layout diagram (Wall clearance + Door zone).
- 3D HTML (wireframe) viewer.

Excel:
- Containers: ContainerType, Inner_L_mm, Inner_W_mm, Inner_H_mm, Tare_kg, MaxPayload_kg
- Items: SKU, L_mm, W_mm, H_mm, Weight_kg, Qty, Stackable(Y/N), MaxStack, AllowRotate(Y/N),
         NoWall(Y/N), NearDoor(Y/N), DG_Class (blank if not DG)
- Settings:
    Use_Container, Allow2D_Rotation(Y/N), Height_Bucket_mm,
    Wall_Clearance_mm, Door_Zone_mm, DoorAt(FRONT/BACK)

Requirements:
  pip install pandas numpy matplotlib openpyxl xlsxwriter plotly
"""

import os, json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# ---------------- Helpers ----------------
def load_config(excel_path):
    containers = pd.read_excel(excel_path, sheet_name="Containers")
    items = pd.read_excel(excel_path, sheet_name="Items")
    settings = pd.read_excel(excel_path, sheet_name="Settings")
    use_ctn = str(settings.loc[0,"Use_Container"]).strip()
    allow_rotate = str(settings.loc[0,"Allow2D_Rotation"]).strip().upper() == "Y"
    bucket = int(settings.loc[0,"Height_Bucket_mm"])
    wall_clear = int(settings.loc[0].get("Wall_Clearance_mm", 0)) if "Wall_Clearance_mm" in settings.columns else 0
    door_zone = int(settings.loc[0].get("Door_Zone_mm", 0)) if "Door_Zone_mm" in settings.columns else 0
    door_at = str(settings.loc[0].get("DoorAt", "FRONT")).strip().upper() if "DoorAt" in settings.columns else "FRONT"
    ct = containers[containers["ContainerType"]==use_ctn].iloc[0].to_dict()
    cfg = {"allow_rotate": allow_rotate, "bucket_mm": bucket, "wall_clear": wall_clear,
           "door_zone": door_zone, "door_at": door_at}
    return ct, items, cfg

def expand_items(items, cap=5000):
    def yn(val): return str(val).strip().upper() == "Y"
    expanded = []
    for _, r in items.iterrows():
        qty = int(r["Qty"])
        qty = min(qty, max(0, cap - len(expanded)))
        for _ in range(qty):
            expanded.append({
                "SKU": str(r["SKU"]),
                "L": int(r["L_mm"]), "W": int(r["W_mm"]), "H": int(r["H_mm"]),
                "Weight": float(r["Weight_kg"]),
                "Stackable": yn(r["Stackable"]),
                "MaxStack": int(r["MaxStack"]) if not pd.isna(r["MaxStack"]) else 1,
                "AllowRotate": yn(r["AllowRotate"]),
                "NoWall": yn(r.get("NoWall","N")),
                "NearDoor": yn(r.get("NearDoor","N")),
                "DG_Class": str(r.get("DG_Class","")).strip()
            })
        if len(expanded) >= cap: break
    return expanded

def bucket_by_height(boxes, bucket_mm=50):
    for b in boxes: b["H_bucket"] = int(bucket_mm * round(b["H"]/bucket_mm))
    groups = {}
    for b in boxes: groups.setdefault(b["H_bucket"], []).append(b)
    keys = sorted(groups.keys(), reverse=True)  # tallest first
    return [(k, groups[k]) for k in keys]

def make_new_layer(z0, h_fixed):
    return {"z0": z0, "height": h_fixed, "placements": [], "shelves": [], "next_y": 0}

def placement_ok(x, y, lx, wy, cont_L, cont_W, box, cfg):
    c = cfg["wall_clear"]
    if box["NoWall"]:
        if x < c or y < c or (x + lx) > (cont_L - c) or (y + wy) > (cont_W - c):
            return False
    dz = cfg["door_zone"]
    if box["NearDoor"] and dz > 0:
        if cfg["door_at"] == "FRONT":
            if (x + lx) > dz: return False
        else:
            if x < (cont_L - dz): return False
    return True

def try_place_in_layer(layer, box, cont_L, cont_W, cfg):
    allow_rotate = cfg["allow_rotate"]
    shelves = layer["shelves"]
    orientations = [(box["L"], box["W"])]
    if allow_rotate and box["AllowRotate"]: orientations.append((box["W"], box["L"]))
    # existing shelves
    for si, shelf in enumerate(shelves):
        for (lx, wy) in orientations:
            if wy <= shelf["height"] and shelf["x"] + lx <= cont_L:
                x, y = shelf["x"], shelf["y"]
                if not placement_ok(x, y, lx, wy, cont_L, cont_W, box, cfg): continue
                shelf["x"] += lx
                layer["placements"].append({"SKU": box["SKU"], "x": x, "y": y, "l": lx, "w": wy,
                                            "h": box["H"], "shelf_id": si, "weight": box["Weight"],
                                            "DG_Class": box.get("DG_Class","")})
                return True
    # new shelf
    for (lx, wy) in orientations:
        new_y = layer["next_y"]
        if new_y + wy <= cont_W and lx <= cont_L:
            x, y = 0, new_y
            if not placement_ok(x, y, lx, wy, cont_L, cont_W, box, cfg): continue
            si = len(shelves)
            shelves.append({"y": new_y, "height": wy, "x": lx})
            layer["placements"].append({"SKU": box["SKU"], "x": 0, "y": new_y, "l": lx, "w": wy,
                                        "h": box["H"], "shelf_id": si, "weight": box["Weight"],
                                        "DG_Class": box.get("DG_Class","")})
            layer["next_y"] += wy
            return True
    return False

def pack_layer_fixed_height(boxes, cont_L, cont_W, cfg, h_fixed):
    layer = make_new_layer(z0=0, h_fixed=h_fixed)
    placed = []
    order = sorted(range(len(boxes)), key=lambda i: (-(boxes[i]["L"]*boxes[i]["W"]), -max(boxes[i]["L"], boxes[i]["W"])))
    for i in order:
        b = boxes[i]
        if b["H"] > h_fixed: continue
        if try_place_in_layer(layer, b, cont_L, cont_W, cfg): placed.append(i)
    remaining = [boxes[i] for i in range(len(boxes)) if i not in set(placed)]
    return layer, remaining

def draw_layer(layer, cont_L, cont_W, out_png_path, title="Layer"):
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.add_patch(plt.Rectangle((0,0), cont_L, cont_W, fill=False))
    for p in layer["placements"]:
        rect = plt.Rectangle((p["x"], p["y"]), p["l"], p["w"], alpha=0.5)
        ax.add_patch(rect)
        label = f"{p['SKU']}"
        if p.get("DG_Class"): label += f"\nDG:{p['DG_Class']}"
        ax.text(p["x"]+p["l"]/2, p["y"]+p["w"]/2, label, ha="center", va="center", fontsize=6)
    ax.set_xlim(0, cont_L); ax.set_ylim(0, cont_W); ax.set_aspect('equal', adjustable='box')
    ax.set_title(title); ax.set_xlabel("Length (mm)"); ax.set_ylabel("Width (mm)")
    plt.tight_layout(); plt.savefig(out_png_path, dpi=160); plt.close(fig)

def segregate_dg(boxes):
    dg_classes = sorted(set([b["DG_Class"] for b in boxes if b.get("DG_Class")]))
    dg_grouped = {cls: [b for b in boxes if b.get("DG_Class")==cls] for cls in dg_classes}
    non_dg = [b for b in boxes if not b.get("DG_Class")]
    return dg_grouped, non_dg

def mix_height_pack_for_group(group_boxes, cont_L, cont_W, cont_H, cfg):
    """Return layers list using mix-height-in-layer for a set of boxes (same DG class or non-DG)."""
    layers = []
    used_height = 0
    groups = bucket_by_height(group_boxes, bucket_mm=cfg["bucket_mm"])
    i = 0
    while i < len(groups):
        h_top, top_boxes = groups[i]
        if not top_boxes: i += 1; continue
        if used_height + h_top > cont_H: break
        layer, remaining_top = pack_layer_fixed_height(top_boxes, cont_L, cont_W, cfg, h_top)
        # fill with lower heights
        j = i + 1
        while j < len(groups):
            h_low, low_boxes = groups[j]
            if not low_boxes: j += 1; continue
            low_fit = [b for b in low_boxes if b["H"] <= h_top]
            placed_here = []
            for b in sorted(low_fit, key=lambda b: (-(b["L"]*b["W"]), -max(b["L"], b["W"]))):
                if try_place_in_layer(layer, b, cont_L, cont_W, cfg):
                    placed_here.append(b)
            if placed_here:
                left = []
                placed_ids = set(id(x) for x in placed_here)
                for b in low_boxes:
                    if id(b) not in placed_ids: left.append(b)
                groups[j] = (h_low, left)
            j += 1
        layers.append(layer); used_height += h_top
        groups[i] = (h_top, remaining_top)
        if len(groups[i][1]) == 0: i += 1
    return layers

def compute_plan_from_excel(excel_path, out_dir):
    ct, items, cfg = load_config(excel_path)
    cont_L, cont_W, cont_H = int(ct["Inner_L_mm"]), int(ct["Inner_W_mm"]), int(ct["Inner_H_mm"])
    tare, max_payload = float(ct["Tare_kg"]), float(ct["MaxPayload_kg"])

    boxes = expand_items(items)
    dg_grouped, non_dg = segregate_dg(boxes)

    layers = []
    used_height_total = 0

    # 1) DG per class with mix-height-in-layer inside each class
    for cls in sorted(dg_grouped.keys()):
        class_layers = mix_height_pack_for_group(dg_grouped[cls], cont_L, cont_W, cont_H - used_height_total, cfg)
        # adjust used height and append
        for lyr in class_layers:
            if used_height_total + lyr["height"] > cont_H: break
            layers.append(lyr); used_height_total += lyr["height"]

    # 2) Non-DG with mix-height-in-layer
    if used_height_total < cont_H and non_dg:
        non_dg_layers = mix_height_pack_for_group(non_dg, cont_L, cont_W, cont_H - used_height_total, cfg)
        for lyr in non_dg_layers:
            if used_height_total + lyr["height"] > cont_H: break
            layers.append(lyr); used_height_total += lyr["height"]

    # Build plan df
    rows, total_weight = [], 0.0
    for idx, layer in enumerate(layers, start=1):
        for p in layer["placements"]:
            rows.append({"Layer": idx, "SKU": p["SKU"], "X_mm": int(p["x"]), "Y_mm": int(p["y"]),
                         "L_mm": int(p["l"]), "W_mm": int(p["w"]), "H_mm": int(layer["height"]),
                         "ShelfID": p["shelf_id"], "Weight_kg": float(p.get("weight", 0.0)),
                         "DG_Class": p.get("DG_Class","")})
            total_weight += float(p.get("weight", 0.0))
    plan = pd.DataFrame(rows)

    # Save plan + images
    os.makedirs(out_dir, exist_ok=True)
    plan_xlsx = os.path.join(out_dir, "loading_plan.xlsx")
    with pd.ExcelWriter(plan_xlsx, engine="xlsxwriter") as w:
        plan.to_excel(w, index=False, sheet_name="Plan")

    for i, layer in enumerate(layers, start=1):
        draw_layer(layer, cont_L, cont_W, os.path.join(out_dir, f"layer_{i}.png"),
                   title=f"Layer {i} (h={layer['height']} mm)")

    # Summary + warnings
    summary = {"ContainerType": ct["ContainerType"], "Inner_L_mm": cont_L, "Inner_W_mm": cont_W,
               "Inner_H_mm": cont_H, "Tare_kg": tare, "MaxPayload_kg": max_payload,
               "Planned_Cargo_kg": float(total_weight), "VGM_kg": float(tare + total_weight),
               "Layers": int(len(layers))}
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    warnings = []
    if len(plan):
        cx = plan["X_mm"] + plan["L_mm"]/2.0
        cy = plan["Y_mm"] + plan["W_mm"]/2.0
        front_w = plan.loc[cx <= cont_L/2, "Weight_kg"].sum()
        back_w  = plan.loc[cx >  cont_L/2, "Weight_kg"].sum()
        left_w  = plan.loc[cy <= cont_W/2, "Weight_kg"].sum()
        right_w = plan.loc[cy >  cont_W/2, "Weight_kg"].sum()
        tot_fb, tot_lr = front_w + back_w, left_w + right_w
        if tot_fb and (front_w/tot_fb < 0.35 or front_w/tot_fb > 0.65):
            warnings.append("WARNING: Front/Back weight balance is skewed beyond ~35/65.")
        if tot_lr and (left_w/tot_lr < 0.35 or left_w/tot_lr > 0.65):
            warnings.append("WARNING: Left/Right weight balance is skewed beyond ~35/65.")
    if summary["Planned_Cargo_kg"] > summary["MaxPayload_kg"]:
        warnings.append("WARNING: Planned cargo weight exceeds container max payload.")
    with open(os.path.join(out_dir, "warnings.txt"), "w", encoding="utf-8") as f:
        for w in warnings: f.write(w + "\n")

    return plan, summary, cfg

def add_container_layout_page(pp, cont_L, cont_W, cfg):
    fig, ax = plt.subplots(figsize=(11.69, 8.27))
    ax.add_patch(plt.Rectangle((0,0), cont_L, cont_W, fill=False, linewidth=2))
    c = cfg.get("wall_clear", 0)
    if c > 0:
        ax.add_patch(plt.Rectangle((c, c), cont_L-2*c, cont_W-2*c, fill=False, linestyle="--", color="red", linewidth=2))
        ax.text(cont_L/2, cont_W+120, f"Wall clearance: {c} mm", ha="center", color="red", fontsize=12)
    dz = cfg.get("door_zone", 0)
    door_at = cfg.get("door_at", "FRONT").upper()
    if dz > 0:
        if door_at == "FRONT":
            ax.add_patch(plt.Rectangle((0,0), dz, cont_W, color="blue", alpha=0.15))
            ax.text(dz/2, cont_W/2, "Door Zone", ha="center", va="center", color="blue", fontsize=14)
        else:
            ax.add_patch(plt.Rectangle((cont_L-dz,0), dz, cont_W, color="blue", alpha=0.15))
            ax.text(cont_L-dz/2, cont_W/2, "Door Zone", ha="center", va="center", color="blue", fontsize=14)
    ax.set_xlim(0, cont_L); ax.set_ylim(0, cont_W+200)
    ax.set_aspect('equal', adjustable='box')
    ax.set_xlabel("Length (mm)"); ax.set_ylabel("Width (mm)")
    ax.set_title("Container Layout – Wall Clearance & Door Zone", fontsize=16)
    plt.tight_layout(); pp.savefig(fig); plt.close(fig)

def build_pdf(plan, summary, cfg, out_dir):
    pdf_path = os.path.join(out_dir, "LoadingInstruction.pdf")
    pp = PdfPages(pdf_path)
    cont_L, cont_W, cont_H = summary["Inner_L_mm"], summary["Inner_W_mm"], summary["Inner_H_mm"]

    # Diagram page
    add_container_layout_page(pp, cont_L, cont_W, cfg)

    # Summary page
    fig1 = plt.figure(figsize=(11.69, 8.27))
    fig1.suptitle("Loading Instruction – Summary", fontsize=18)
    text_lines = [f"Container Type: {summary['ContainerType']}",
                  f"Internal Size (L×W×H mm): {cont_L} × {cont_W} × {cont_H}",
                  f"Tare (kg): {summary['Tare_kg']}", f"Max Payload (kg): {summary['MaxPayload_kg']}",
                  f"Planned Cargo (kg): {summary['Planned_Cargo_kg']}", f"VGM (kg): {summary['VGM_kg']}",
                  f"Layers: {summary['Layers']}", f"SKUs: {plan['SKU'].nunique() if len(plan) else 0}",
                  f"Total Pieces Placed: {len(plan)}"]
    y = 0.8
    for t in text_lines: fig1.text(0.06, y, t, fontsize=12); y -= 0.05
    w_path = os.path.join(out_dir, "warnings.txt")
    if os.path.exists(w_path):
        with open(w_path, "r", encoding="utf-8") as f: ws = [ln.strip() for ln in f if ln.strip()]
        if ws:
            fig1.text(0.06, 0.3, "Warnings:", fontsize=12)
            y2 = 0.25
            for w in ws: fig1.text(0.08, y2, f"- {w}", fontsize=11); y2 -= 0.04
    pp.savefig(fig1); plt.close(fig1)

    # Weight charts
    if len(plan):
        cx = plan["X_mm"] + plan["L_mm"]/2.0; cy = plan["Y_mm"] + plan["W_mm"]/2.0
        front_w = plan.loc[cx <= cont_L/2, "Weight_kg"].sum(); back_w = plan.loc[cx > cont_L/2, "Weight_kg"].sum()
        fig2 = plt.figure(figsize=(8,6)); plt.title("Weight Distribution (Front vs Back)")
        plt.bar(["Front","Back"], [front_w, back_w]); plt.ylabel("Weight (kg)")
        pp.savefig(fig2); plt.close(fig2)
        left_w = plan.loc[cy <= cont_W/2, "Weight_kg"].sum(); right_w = plan.loc[cy > cont_W/2, "Weight_kg"].sum()
        fig3 = plt.figure(figsize=(8,6)); plt.title("Weight Distribution (Left vs Right)")
        plt.bar(["Left","Right"], [left_w, right_w]); plt.ylabel("Weight (kg)")
        pp.savefig(fig3); plt.close(fig3)

    # Layer images
    if len(plan):
        for layer_idx in sorted(plan["Layer"].unique()):
            img_path = os.path.join(out_dir, f"layer_{layer_idx}.png")
            if os.path.exists(img_path):
                fig = plt.figure(figsize=(11.69, 8.27)); img = plt.imread(img_path)
                plt.imshow(img); plt.axis("off"); plt.title(f"Layer {layer_idx} – Top-Down Plan")
                pp.savefig(fig); plt.close(fig)

    pp.close(); return pdf_path

def build_3d_html(plan, summary, out_dir):
    import plotly.graph_objects as go
    from plotly.offline import plot as plotly_plot
    cont_L, cont_W, cont_H = summary["Inner_L_mm"], summary["Inner_W_mm"], summary["Inner_H_mm"]
    html_path = os.path.join(out_dir, "Loading3D.html")
    fig = go.Figure()
    fig.add_trace(go.Scatter3d(x=[0, cont_L, cont_L, 0, 0, 0, cont_L, cont_L, 0],
                               y=[0, 0, cont_W, cont_W, 0, 0, 0, cont_W, cont_W],
                               z=[0, 0, 0, 0, 0, cont_H, cont_H, cont_H, cont_H],
                               mode="lines", name="Container"))
    if len(plan):
        layer_heights = plan.groupby("Layer")["H_mm"].max().sort_index().to_dict()
        z_map, cum = {}, 0
        for layer_idx in sorted(layer_heights.keys()): z_map[layer_idx] = cum; cum += layer_heights[layer_idx]
        for layer_idx, z0 in z_map.items():
            sub = plan[plan["Layer"]==layer_idx]
            for _, r in sub.iterrows():
                xs = [r["X_mm"], r["X_mm"]+r["L_mm"], None, r["X_mm"]+r["L_mm"], r["X_mm"]+r["L_mm"], None,
                      r["X_mm"]+r["L_mm"], r["X_mm"], None, r["X_mm"], r["X_mm"], None]
                ys = [r["Y_mm"], r["Y_mm"], None, r["Y_mm"], r["Y_mm"]+r["W_mm"], None,
                      r["Y_mm"]+r["W_mm"], r["Y_mm"]+r["W_mm"], None, r["Y_mm"]+r["W_mm"], r["Y_mm"], None]
                zs = [z0, z0, None, z0, z0, None, z0, z0, None, z0, z0, None]
                fig.add_trace(go.Scatter3d(x=xs, y=ys, z=zs, mode="lines", name=str(r["SKU"])))
    fig.update_layout(title="Container Loading – 3D View (approximate)",
                      scene=dict(xaxis_title="Length (mm)", yaxis_title="Width (mm)", zaxis_title="Height (mm)",
                                 aspectmode="data"),
                      showlegend=False)
    plotly_plot(fig, filename=html_path, auto_open=False, include_plotlyjs=True)
    return html_path

def run(excel_path="ContainerLoadingDemo.xlsx", out_dir="output_plan_real"):
    plan, summary, cfg = compute_plan_from_excel(excel_path, out_dir)
    pdf = build_pdf(plan, summary, cfg, out_dir)
    html = build_3d_html(plan, summary, out_dir)
    print("Output directory:", out_dir)
    print("Plan rows:", len(plan))
    print("PDF:", pdf)
    print("3D HTML:", html)

if __name__ == "__main__":
    run()
