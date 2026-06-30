from ultralytics import YOLO
import matplotlib.pyplot as plt
import pandas as pd
import os

def plot_training_metrics(results_csv_path):
    """
    Plot training and validation metrics from the results CSV file.
    This helps detect overfitting, underfitting, and other training issues.
    """
    if not os.path.exists(results_csv_path):
        print(f"Results file not found: {results_csv_path}")
        return
    
    # Read the results CSV
    df = pd.read_csv(results_csv_path)
    
    # Create figure with subplots
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    fig.suptitle('YOLOv8 Training Metrics - Overfitting/Underfitting Analysis', fontsize=16, fontweight='bold')
    
    # 1. Loss Curves (Training vs Validation)
    ax = axes[0, 0]
    if 'train/loss' in df.columns and 'val/loss' in df.columns:
        ax.plot(df.index, df['train/loss'], label='Train Loss', marker='o', linewidth=2)
        ax.plot(df.index, df['val/loss'], label='Val Loss', marker='s', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Loss')
        ax.set_title('Loss Curves')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # 2. Accuracy (mAP50)
    ax = axes[0, 1]
    if 'metrics/mAP50(B)' in df.columns:
        ax.plot(df.index, df['metrics/mAP50(B)'], label='mAP50', marker='o', linewidth=2, color='green')
        ax.set_xlabel('Epoch')
        ax.set_ylabel('mAP50')
        ax.set_title('Mean Average Precision (mAP50)')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # 3. Precision vs Recall
    ax = axes[0, 2]
    if 'metrics/precision(B)' in df.columns and 'metrics/recall(B)' in df.columns:
        ax.plot(df.index, df['metrics/precision(B)'], label='Precision', marker='o', linewidth=2)
        ax.plot(df.index, df['metrics/recall(B)'], label='Recall', marker='s', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Score')
        ax.set_title('Precision vs Recall')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # 4. Box Loss
    ax = axes[1, 0]
    if 'train/box_loss' in df.columns and 'val/box_loss' in df.columns:
        ax.plot(df.index, df['train/box_loss'], label='Train Box Loss', marker='o', linewidth=2)
        ax.plot(df.index, df['val/box_loss'], label='Val Box Loss', marker='s', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Box Loss')
        ax.set_title('Bounding Box Loss')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # 5. Class Loss
    ax = axes[1, 1]
    if 'train/cls_loss' in df.columns and 'val/cls_loss' in df.columns:
        ax.plot(df.index, df['train/cls_loss'], label='Train Class Loss', marker='o', linewidth=2)
        ax.plot(df.index, df['val/cls_loss'], label='Val Class Loss', marker='s', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Class Loss')
        ax.set_title('Classification Loss')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    # 6. Objectness Loss
    ax = axes[1, 2]
    if 'train/obj_loss' in df.columns and 'val/obj_loss' in df.columns:
        ax.plot(df.index, df['train/obj_loss'], label='Train Obj Loss', marker='o', linewidth=2)
        ax.plot(df.index, df['val/obj_loss'], label='Val Obj Loss', marker='s', linewidth=2)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Objectness Loss')
        ax.set_title('Objectness Loss')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('training_metrics.png', dpi=300, bbox_inches='tight')
    print("Graph saved as 'training_metrics.png'")
    plt.show()

def main():
    model = YOLO("yolov8n.pt")  # nano model for CPU

    results = model.train(
        data="pothole.yaml",
        epochs=30,
        imgsz=640,
        batch=6,
        device="cuda",
        workers=0
    )

    # Find and plot the results CSV file
    # YOLOv8 saves results in runs/detect/train/results.csv by default
    results_csv_path = "runs/detect/train/results.csv"
    
    # Check if this is a new training run with a numbered folder
    if not os.path.exists(results_csv_path):
        # Find the latest training run
        detect_folder = "runs/detect"
        if os.path.exists(detect_folder):
            train_folders = [f for f in os.listdir(detect_folder) if f.startswith("train")]
            if train_folders:
                latest_train = max(train_folders, key=lambda x: os.path.getctime(os.path.join(detect_folder, x)))
                results_csv_path = os.path.join(detect_folder, latest_train, "results.csv")
    
    # Plot training metrics
    if os.path.exists(results_csv_path):
        print(f"\nPlotting metrics from: {results_csv_path}")
        plot_training_metrics(results_csv_path)
    else:
        print(f"Could not find results CSV at {results_csv_path}")

if __name__ == "__main__":
    main()
