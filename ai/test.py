from ultralytics import YOLO
import cv2
from tkinter import Tk, filedialog
import os

# Load trained YOLO model
model = YOLO("runs/detect/train2/weights/best.pt")


def select_file(file_type):
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    if file_type == "image":
        path = filedialog.askopenfilename(
            title="Select Image",
            filetypes=[
                ("Image Files", "*.jpg *.jpeg *.png *.bmp"),
                ("All Files", "*.*")
            ]
        )

    elif file_type == "video":
        path = filedialog.askopenfilename(
            title="Select Video",
            filetypes=[
                ("Video Files", "*.mp4 *.avi *.mov *.mkv"),
                ("All Files", "*.*")
            ]
        )

    root.destroy()
    return path


def draw_detections(frame, results):

    for r in results:

        boxes = r.boxes

        for box in boxes:

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            conf = float(box.conf[0])

            cls = int(box.cls[0])
            class_name = model.names[cls]

            width = x2 - x1
            height = y2 - y1
            area = width * height

            label = f"{class_name} {conf:.2f} | Area:{area}px"

            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            cv2.putText(
                frame,
                label,
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

    return frame


def detect_image():

    image_path = select_file("image")

    if not image_path:
        print("No image selected.")
        return

    results = model(image_path)

    image = cv2.imread(image_path)

    image = draw_detections(image, results)

    cv2.imshow("Pothole Detection - Image", image)

    print("Press any key to close image window...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def detect_video():

    video_path = select_file("video")

    if not video_path:
        print("No video selected.")
        return

    cap = cv2.VideoCapture(video_path)

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        results = model(frame, verbose=False)

        frame = draw_detections(frame, results)

        cv2.imshow("Pothole Detection - Video", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


def detect_webcam():

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Could not open webcam.")
        return

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        results = model(frame, verbose=False)

        frame = draw_detections(frame, results)

        cv2.imshow("Pothole Detection - Webcam", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()


# ==========================
# MAIN MENU
# ==========================

while True:

    print("\n==============================")
    print("      POTHOLE DETECTION")
    print("==============================")
    print("1. Detect Potholes in Image")
    print("2. Detect Potholes in Video")
    print("3. Live Webcam Detection")
    print("4. Exit")

    choice = input("Enter your choice: ")

    if choice == "1":
        detect_image()

    elif choice == "2":
        detect_video()

    elif choice == "3":
        detect_webcam()

    elif choice == "4":
        print("Exiting...")
        break

    else:
        print("Invalid choice. Please try again.")