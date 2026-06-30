import os

# CHANGE THIS PATH IF YOUR DATASET FOLDER NAME IS DIFFERENT
DATASET_PATH = "DATASET RDD"

def fix_labels(split):
    labels_dir = os.path.join(DATASET_PATH, split, "labels")

    if not os.path.exists(labels_dir):
        print(f"[ERROR] Folder not found: {labels_dir}")
        return

    for file in os.listdir(labels_dir):
        if not file.endswith(".txt"):
            continue

        file_path = os.path.join(labels_dir, file)

        with open(file_path, "r") as f:
            lines = f.readlines()

        new_lines = []
        for line in lines:
            parts = line.strip().split()
            if len(parts) < 5:
                continue  # skip broken lines

            # FORCE CLASS ID TO 0 (POTHOLE)
            parts[0] = "0"
            new_lines.append(" ".join(parts) + "\n")

        with open(file_path, "w") as f:
            f.writelines(new_lines)

    print(f"[DONE] Fixed labels in {split}/labels")

if __name__ == "__main__":
    for split in ["train", "val", "test"]:
        fix_labels(split)
