export const shouldTriggerAlert = (pothole)=>{
    if(pothole.status === "repaired") return false;
    if(pothole.severity === "low") return false;
    if(pothole.confidence < 0.7) return false;
    return true;
}