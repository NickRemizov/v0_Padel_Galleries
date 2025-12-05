kept_ids = [f.id for f in request.kept_faces if f.id]
        
        # DELETE removed faces
        to_delete = [fid for fid in existing_ids if fid not in kept_ids]
        if len(to_delete) > 0:
            logger.info(f"[Faces API] Deleting {len(to_delete)} removed faces")
            for face_id in to_delete:
                supabase_db.client.table("photo_faces").delete().eq("id", face_id).execute()
            logger.info(f"[Faces API] ✓ Deleted {len(to_delete)} faces")
        
        # UPDATE kept faces
        all_have_person_id = True
        for face in request.kept_faces:
            face_id = face.id
            person_id = face.person_id
            
            if not person_id:
                all_have_person_id = False
            
            if face_id:
                update_data = {
                    "person_id": person_id,
                    "recognition_confidence": 1.0 if person_id else None,
                    "verified": bool(person_id),
                }
                
                supabase_db.client.table("photo_faces").update(update_data).eq("id", face_id).execute()
                logger.info(f"[Faces API] ✓ Updated face {face_id}: person_id={person_id}, confidence={update_data['recognition_confidence']}, verified={bool(person_id)}")
