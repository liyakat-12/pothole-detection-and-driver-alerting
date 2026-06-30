from ultralytics import YOLO
from tkinter import Tk
from tkinter.filedialog import askopenfilename
import cv2

# Hide tkinter window
Tk().withdraw()

# Open file manager
file_path = askopenfilename(
    title="Select Image or Video",
    filetypes=[
        ("Image and Video", "*.jpg *.jpeg *.png *.mp4 *.avi *.mov")
    ]
)

print("Selected:", file_path)

# Load trained model
model = YOLO("runs/detect/train2/weights/best.pt")

# Check if file is image or video
if file_path.lower().endswith((".jpg", ".jpeg", ".png")):

    # IMAGE DETECTION
    results = model(file_path)
    frame = results[0].plot()

    cv2.imshow("Pothole Detection", frame)
    cv2.waitKey(0)

else:

    # VIDEO DETECTION
    cap = cv2.VideoCapture(file_path)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model(frame)
        annotated_frame = results[0].plot()

        cv2.imshow("Pothole Detection", annotated_frame)

        # press q to stop
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()

cv2.destroyAllWindows()



# from ultralytics import YOLO
# from tkinter import Tk
# from tkinter.filedialog import askopenfilename

# # hide tkinter root window
# Tk().withdraw()

# # open file manager to choose image or video
# file_path = askopenfilename(
#     title="Select Image or Video",
#     filetypes=[
#         ("Image files", "*.jpg *.jpeg *.png"),
#         ("Video files", "*.mp4 *.avi *.mov")
#     ]
# )

# print("Selected file:", file_path)

# # load trained model
# model = YOLO("runs/detect/train2/weights/best.pt")

# # run prediction
# results = model.predict(
#     source=file_path,
#     conf=0.25,
#     show=True,
#     save=True
# )

# print("Detection completed")